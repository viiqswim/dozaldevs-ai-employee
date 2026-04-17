/*
  Warnings:

  - Added the required column `updated_at` to the `agent_versions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `archetypes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `audit_log` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `clarifications` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `cross_dept_triggers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `deliverables` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `departments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `feedback` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `knowledge_bases` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `reviews` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `risk_models` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `task_status_log` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `validation_runs` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "agent_versions" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "archetypes" ADD COLUMN     "instructions" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "clarifications" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "cross_dept_triggers" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "deliverables" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "feedback" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "knowledge_bases" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "reviews" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "risk_models" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "task_status_log" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "tasks" ALTER COLUMN "tenant_id" SET DEFAULT '00000000-0000-0000-0000-000000000001';

-- AlterTable
ALTER TABLE "validation_runs" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "tenant_integrations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "config" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenant_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenant_integrations_tenant_id_provider_key" ON "tenant_integrations"("tenant_id", "provider");

-- AddForeignKey
ALTER TABLE "tenant_integrations" ADD CONSTRAINT "tenant_integrations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
