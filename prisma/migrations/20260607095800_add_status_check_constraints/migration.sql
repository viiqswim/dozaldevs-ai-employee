-- Update tasks.status CHECK constraint to exactly match the 13 lifecycle states.
-- Drops legacy values (Stale, AwaitingApproval) that are no longer valid states.
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_status_check";

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check"
  CHECK (status = ANY (ARRAY[
    'Received'::text,
    'Triaging'::text,
    'AwaitingInput'::text,
    'Ready'::text,
    'Executing'::text,
    'Validating'::text,
    'Submitting'::text,
    'Reviewing'::text,
    'Approved'::text,
    'Delivering'::text,
    'Done'::text,
    'Failed'::text,
    'Cancelled'::text
  ]));

-- Add executions.status CHECK constraint.
-- Valid values: pending (schema default), running, completed, failed.
ALTER TABLE "executions" DROP CONSTRAINT IF EXISTS "executions_status_check";

ALTER TABLE "executions" ADD CONSTRAINT "executions_status_check"
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'running'::text,
    'completed'::text,
    'failed'::text
  ]));
