-- Deduplicate: keep one row per model_id (lowest ctid wins), delete the rest
DELETE FROM "model_catalog" a USING "model_catalog" b
WHERE a.ctid < b.ctid AND a.model_id = b.model_id;

-- DropForeignKey
ALTER TABLE "model_catalog" DROP CONSTRAINT IF EXISTS "model_catalog_tenant_id_fkey";

-- DropIndex
DROP INDEX IF EXISTS "model_catalog_tenant_id_idx";

-- DropIndex
DROP INDEX IF EXISTS "model_catalog_tenant_id_model_id_key";

-- AlterTable
ALTER TABLE "model_catalog" DROP COLUMN IF EXISTS "tenant_id";

-- CreateIndex
CREATE UNIQUE INDEX "model_catalog_model_id_key" ON "model_catalog"("model_id");
