-- CreateTable
CREATE TABLE "knowledge_base_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "scope" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_base_entries_tenant_id_entity_type_entity_id_idx" ON "knowledge_base_entries"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_base_entries_tenant_id_entity_type_entity_id_scop_key" ON "knowledge_base_entries"("tenant_id", "entity_type", "entity_id", "scope");

-- AddForeignKey
ALTER TABLE "knowledge_base_entries" ADD CONSTRAINT "knowledge_base_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "knowledge_base_entries" ADD CONSTRAINT "knowledge_base_entries_scope_check" CHECK (scope IN ('common', 'entity'));
