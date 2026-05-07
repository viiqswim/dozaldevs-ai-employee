BEGIN;

UPDATE tasks
SET status = 'Cancelled', updated_at = NOW()
WHERE archetype_id = '00000000-0000-0000-0000-000000000016'
  AND status NOT IN ('Done', 'Failed', 'Cancelled');

DELETE FROM deliverables
WHERE external_ref IN (
  SELECT id::text FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016'
);

DELETE FROM executions
WHERE task_id IN (
  SELECT id FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016'
);

DELETE FROM audit_log
WHERE task_id IN (
  SELECT id FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016'
);

DELETE FROM clarifications
WHERE task_id IN (
  SELECT id FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016'
);

DELETE FROM cross_dept_triggers
WHERE source_task_id IN (
  SELECT id FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016'
);

DELETE FROM feedback
WHERE task_id IN (
  SELECT id FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016'
);

DELETE FROM task_status_log
WHERE task_id IN (
  SELECT id FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016'
);

DELETE FROM pending_approvals
WHERE task_id IN (
  SELECT id::text FROM tasks WHERE archetype_id = '00000000-0000-0000-0000-000000000016'
);

DELETE FROM tasks
WHERE archetype_id = '00000000-0000-0000-0000-000000000016';

DELETE FROM knowledge_bases
WHERE archetype_id = '00000000-0000-0000-0000-000000000016';

DELETE FROM archetypes
WHERE id = '00000000-0000-0000-0000-000000000016';

COMMIT;

SELECT COUNT(*) AS remaining_tasks     FROM tasks      WHERE archetype_id = '00000000-0000-0000-0000-000000000016';
SELECT COUNT(*) AS remaining_archetype FROM archetypes WHERE id = '00000000-0000-0000-0000-000000000016';
