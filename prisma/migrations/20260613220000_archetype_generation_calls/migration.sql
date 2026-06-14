-- Add created_by to archetypes table
ALTER TABLE "archetypes" ADD COLUMN "created_by" UUID;

-- Create archetype_generation_calls table
CREATE TABLE "archetype_generation_calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "archetype_id" UUID,
    "call_type" TEXT NOT NULL,
    "model_requested" TEXT,
    "model_actual" TEXT,
    "prompt" TEXT,
    "response" TEXT,
    "prompt_truncated" BOOLEAN NOT NULL DEFAULT false,
    "response_truncated" BOOLEAN NOT NULL DEFAULT false,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "estimated_cost_usd" DECIMAL(10,6),
    "latency_ms" INTEGER,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "archetype_generation_calls_pkey" PRIMARY KEY ("id")
);

-- Create indexes
CREATE INDEX "archetype_generation_calls_tenant_id_created_at_idx" ON "archetype_generation_calls"("tenant_id", "created_at");
CREATE INDEX "archetype_generation_calls_archetype_id_idx" ON "archetype_generation_calls"("archetype_id");
