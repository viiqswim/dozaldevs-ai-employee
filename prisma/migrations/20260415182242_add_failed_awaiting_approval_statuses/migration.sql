-- Add 'Failed' and 'AwaitingApproval' to the tasks status check constraint.
-- These statuses are required by the generic employee lifecycle and generic harness.

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
    'Cancelled'::text,
    'Stale'::text,
    'Failed'::text,
    'AwaitingApproval'::text
  ]));
