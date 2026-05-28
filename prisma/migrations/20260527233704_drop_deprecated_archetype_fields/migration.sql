-- Drop deprecated columns from archetypes table.
-- system_prompt was superseded by identity (added in 20260527224218).
-- agents_md was superseded by execution_steps (added in 20260527224218).
ALTER TABLE "archetypes" DROP COLUMN IF EXISTS "system_prompt";
ALTER TABLE "archetypes" DROP COLUMN IF EXISTS "agents_md";
