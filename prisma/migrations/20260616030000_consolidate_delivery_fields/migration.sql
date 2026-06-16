-- COALESCE backfill: copy delivery_instructions into delivery_steps for rows where delivery_steps IS NULL
-- Only 1 employee is affected (real-estate-motivation-bot-2)
-- Rows with delivery_steps already set are untouched (COALESCE short-circuits on non-null)
UPDATE archetypes
SET delivery_steps = COALESCE(delivery_steps, delivery_instructions)
WHERE delivery_steps IS NULL;

-- Drop the now-redundant delivery_instructions column
ALTER TABLE archetypes DROP COLUMN delivery_instructions;
