-- DropIndex
DROP INDEX "archetypes_tenant_id_role_name_key";

-- AlterTable
ALTER TABLE "archetypes" ADD COLUMN     "overview" JSONB,
ADD COLUMN     "parent_draft_id" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

-- CreateIndex (partial unique index — only enforces uniqueness for active archetypes)
CREATE UNIQUE INDEX archetypes_tenant_role_active_unique ON archetypes (tenant_id, role_name) WHERE status = 'active';
