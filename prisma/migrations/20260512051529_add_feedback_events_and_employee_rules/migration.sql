-- AlterTable
ALTER TABLE "property_locks" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "feedback_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "archetype_id" UUID NOT NULL,
    "task_id" UUID,
    "event_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "correction_content" TEXT,
    "original_content" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "archetype_id" UUID NOT NULL,
    "rule_text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source_task_id" UUID,
    "parent_rule_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "slack_ts" TEXT,
    "slack_channel" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "employee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_events_tenant_id_archetype_id_created_at_idx" ON "feedback_events"("tenant_id", "archetype_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "employee_rules_tenant_id_archetype_id_status_idx" ON "employee_rules"("tenant_id", "archetype_id", "status");

-- CreateIndex
CREATE INDEX "employee_rules_status_archetype_id_idx" ON "employee_rules"("status", "archetype_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_rules_source_task_source_unique" ON "employee_rules"("source_task_id", "source");

-- AddForeignKey
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_events" ADD CONSTRAINT "feedback_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_rules" ADD CONSTRAINT "employee_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_rules" ADD CONSTRAINT "employee_rules_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
