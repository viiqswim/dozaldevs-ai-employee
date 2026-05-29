-- Migration: add_execution_phase_and_require_model
-- 1. Add phase column to executions with NOT NULL DEFAULT 'execution'
ALTER TABLE "executions" ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'execution';

-- 2. Backfill any NULL model values in archetypes before making NOT NULL
UPDATE "archetypes" SET "model" = 'minimax/minimax-m2.7' WHERE "model" IS NULL;

-- 3. Make archetypes.model NOT NULL
ALTER TABLE "archetypes" ALTER COLUMN "model" SET NOT NULL;
