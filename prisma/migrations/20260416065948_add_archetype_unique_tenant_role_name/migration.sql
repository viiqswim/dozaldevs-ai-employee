/*
  Warnings:

  - A unique constraint covering the columns `[tenant_id,role_name]` on the table `archetypes` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "archetypes" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "departments" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "feedback" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "knowledge_bases" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- CreateIndex
CREATE UNIQUE INDEX "archetypes_tenant_id_role_name_key" ON "archetypes"("tenant_id", "role_name");
