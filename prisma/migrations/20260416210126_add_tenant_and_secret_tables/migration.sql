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

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "slack_team_id" TEXT,
    "config" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_secrets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "auth_tag" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_secrets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (partial: only enforce slug uniqueness among active/non-deleted tenants)
CREATE UNIQUE INDEX "tenants_slug_active_key" ON "tenants"("slug") WHERE "deleted_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slack_team_id_key" ON "tenants"("slack_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_secrets_tenant_id_key_key" ON "tenant_secrets"("tenant_id", "key");

-- AddForeignKey
ALTER TABLE "tenant_secrets" ADD CONSTRAINT "tenant_secrets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: seed the Platform tenant (preserves legacy system tenant UUID)
INSERT INTO "tenants" ("id", "name", "slug", "status", "created_at", "updated_at")
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Platform',
  'platform',
  'active',
  NOW(),
  NOW()
) ON CONFLICT ("id") DO NOTHING;
