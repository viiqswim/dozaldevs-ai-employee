-- AlterTable
ALTER TABLE "archetypes" ALTER COLUMN "tenant_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "tenant_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "feedback" ALTER COLUMN "tenant_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "knowledge_bases" ALTER COLUMN "tenant_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "tenant_id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "tenant_id" DROP DEFAULT;

-- Delete Platform tenant and its children (FK order: children before parent)
DELETE FROM "archetypes" WHERE "id" = '00000000-0000-0000-0000-000000000011';
DELETE FROM "departments" WHERE "id" = '00000000-0000-0000-0000-000000000010';
DELETE FROM "tenants" WHERE "id" = '00000000-0000-0000-0000-000000000001';
