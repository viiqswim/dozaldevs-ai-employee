-- CreateTable
CREATE TABLE "model_catalog" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "description" TEXT,
    "context_window" INTEGER NOT NULL,
    "input_cost_per_million" DOUBLE PRECISION NOT NULL,
    "output_cost_per_million" DOUBLE PRECISION NOT NULL,
    "is_free" BOOLEAN NOT NULL DEFAULT false,
    "throughput_tokens_per_sec" DOUBLE PRECISION,
    "latency_seconds" DOUBLE PRECISION,
    "tool_call_error_rate" DOUBLE PRECISION,
    "structured_output_error_rate" DOUBLE PRECISION,
    "quality_index" DOUBLE PRECISION,
    "agentic_score" DOUBLE PRECISION,
    "tool_use_score" DOUBLE PRECISION,
    "instruction_following_score" DOUBLE PRECISION,
    "non_hallucination_rate" DOUBLE PRECISION,
    "supports_tools" BOOLEAN NOT NULL DEFAULT false,
    "supports_structured_output" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "model_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_catalog_tenant_id_idx" ON "model_catalog"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "model_catalog_tenant_id_model_id_key" ON "model_catalog"("tenant_id", "model_id");

-- AddForeignKey
ALTER TABLE "model_catalog" ADD CONSTRAINT "model_catalog_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
