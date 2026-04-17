/*
  Warnings:

  - You are about to drop the column `steps` on the `archetypes` table. All the data in the column will be lost.
  - You are about to drop the column `slack_team_id` on the `tenants` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "tenants_slack_team_id_key";

-- AlterTable
ALTER TABLE "archetypes" DROP COLUMN "steps",
ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

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

-- AlterTable
ALTER TABLE "tenants" DROP COLUMN "slack_team_id";
