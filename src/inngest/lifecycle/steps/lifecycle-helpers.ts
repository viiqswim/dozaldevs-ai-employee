import { createLogger } from '../../../lib/logger.js';
import { destroyMachine } from '../../../lib/fly-client.js';
import { recordWorkMetric, stopLocalDockerContainer } from '../../lib/lifecycle-helpers.js';

const log = createLogger('lifecycle-helpers');

/**
 * Destroys the execution machine (Fly.io or local Docker) after a task completes.
 * Uses the `machineId.startsWith('docker_')` heuristic to distinguish runtimes.
 * Non-fatal: logs a warning if destruction fails (machine may have auto-destroyed).
 *
 * NOTE: The `cleanup` step at the end of the reviewing path uses a different condition
 * (`WORKER_RUNTIME !== 'fly' || machineId.startsWith('docker_')`) and is NOT covered
 * by this helper — it stays inline.
 */
export async function cleanupExecutionMachine(machineId: string, taskId: string): Promise<void> {
  try {
    if (machineId.startsWith('docker_')) {
      stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
    } else {
      const flyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
      await destroyMachine(flyApp, machineId);
    }
  } catch (err) {
    log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
  }
}

/**
 * Records a work metric for the task. Non-fatal: logs a warning if recording fails.
 *
 * NOTE: The `record-work-metric-approval` step in the reviewing path has an additional
 * status check (`if (taskStatusRows[0]?.status === 'Done')`) and is NOT covered by this
 * helper — it stays inline.
 */
export async function safeRecordWorkMetric(
  supabaseUrl: string,
  headers: Record<string, string>,
  taskId: string,
  archetypeId: string,
  tenantId: string,
): Promise<void> {
  try {
    await recordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
  } catch (err) {
    log.warn({ err, taskId }, 'Failed to record work metric — non-fatal');
  }
}

/**
 * Standardizes the previously-divergent 6 task-metadata-merge sites; always validates the PATCH response.
 *
 * Fetches the current `metadata` JSONB column for the task, shallow-spreads `updates` onto it,
 * sets `updated_at` to a fresh ISO timestamp, then PATCHes back via PostgREST.
 * Handles `metadata: null` → `{}`. Always checks `res.ok` and emits a structured `log.warn` on failure.
 */
export async function mergeTaskMetadata(
  supabaseUrl: string,
  headers: Record<string, string>,
  taskId: string,
  updates: Record<string, unknown>,
): Promise<void> {
  const getRes = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=metadata`, {
    headers,
  });
  const rows = (await getRes.json()) as Array<{ metadata: Record<string, unknown> | null }>;
  const currentMetadata = rows[0]?.metadata ?? {};
  const newMetadata = {
    ...currentMetadata,
    ...updates,
    updated_at: new Date().toISOString(),
  };
  const patchRes = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ metadata: newMetadata }),
  });
  if (!patchRes.ok) {
    log.warn({ taskId, status: patchRes.status }, 'Failed to merge task metadata');
  }
}

/**
 * Writes a row to the `feedback_events` table via PostgREST.
 * Used by approval-handler (reject + approve paths) to record PM feedback for rule extraction.
 */
export async function writeFeedbackEvent(opts: {
  supabaseUrl: string;
  supabaseKey: string;
  tenantId: string;
  archetypeId: string;
  taskId: string;
  eventType: string;
  actorId: string;
  correctionContent?: string | null;
  originalContent?: string | null;
}): Promise<void> {
  const {
    supabaseUrl,
    supabaseKey,
    tenantId,
    archetypeId,
    taskId,
    eventType,
    actorId,
    correctionContent,
    originalContent,
  } = opts;
  try {
    const body: Record<string, unknown> = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      archetype_id: archetypeId,
      task_id: taskId,
      event_type: eventType,
      actor_id: actorId,
    };
    if (correctionContent != null) body.correction_content = correctionContent;
    if (originalContent != null) body.original_content = originalContent;

    const res = await fetch(`${supabaseUrl}/rest/v1/feedback_events`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      log.warn(
        { taskId, eventType, status: res.status, body: text },
        `Failed to write ${eventType} feedback_event (non-fatal)`,
      );
    } else {
      log.info({ taskId, eventType }, `${eventType} feedback_event written`);
    }
  } catch (err) {
    log.warn({ taskId, eventType, err }, `Error writing ${eventType} feedback_event (non-fatal)`);
  }
}
