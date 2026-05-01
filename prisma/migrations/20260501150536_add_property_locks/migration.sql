-- CreateTable
CREATE TABLE "property_locks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "property_external_id" TEXT NOT NULL,
    "lock_external_id" TEXT NOT NULL,
    "lock_name" TEXT NOT NULL,
    "lock_provider" TEXT NOT NULL DEFAULT 'sifely',
    "lock_role" TEXT,
    "property_type" TEXT NOT NULL,
    "property_name" TEXT NOT NULL,
    "passcode_name" TEXT,
    "lock_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_locks_tenant_id_property_external_id_idx" ON "property_locks"("tenant_id", "property_external_id");

-- AddForeignKey
ALTER TABLE "property_locks" ADD CONSTRAINT "property_locks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
