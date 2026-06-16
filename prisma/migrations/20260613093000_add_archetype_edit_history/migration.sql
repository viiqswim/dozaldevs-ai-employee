-- CreateTable
CREATE TABLE "archetype_edit_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "archetype_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "request_text" TEXT NOT NULL,
    "before_json" JSONB NOT NULL,
    "after_json" JSONB NOT NULL,
    "changed_fields" JSONB NOT NULL,
    "kind" TEXT NOT NULL,
    "actor_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "archetype_edit_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "archetype_edit_history_archetype_id_created_at_idx" ON "archetype_edit_history"("archetype_id", "created_at");

-- CreateIndex
CREATE INDEX "archetype_edit_history_tenant_id_idx" ON "archetype_edit_history"("tenant_id");

-- AddForeignKey
ALTER TABLE "archetype_edit_history" ADD CONSTRAINT "archetype_edit_history_archetype_id_fkey" FOREIGN KEY ("archetype_id") REFERENCES "archetypes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
