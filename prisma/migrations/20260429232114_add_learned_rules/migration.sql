-- CreateTable
CREATE TABLE "learned_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "scope" TEXT NOT NULL,
    "rule_text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source_task_id" TEXT,
    "slack_ts" TEXT,
    "slack_channel" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),

    CONSTRAINT "learned_rules_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "learned_rules" ADD CONSTRAINT "learned_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
