import { randomUUID } from 'node:crypto';
import type { Inngest } from 'inngest';
import type { InngestStep } from '../events.js';
import { requireEnv } from '../../lib/config.js';
import { makePostgrestHeaders } from './postgrest-headers.js';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('task-dispatch');

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseKey = requireEnv('SUPABASE_SECRET_KEY');

export interface CreateTaskAndDispatchParams {
  inngest: Inngest;
  step: InngestStep;
  tenantId: string;
  archetypeSlug: string;
  externalId: string;
  sourceSystem: string;
}

export interface CreateTaskAndDispatchResult {
  taskId: string | null;
  archetypeId: string | null;
}

export async function createTaskAndDispatch(
  params: CreateTaskAndDispatchParams,
): Promise<CreateTaskAndDispatchResult> {
  const { inngest, step, tenantId, archetypeSlug, externalId, sourceSystem } = params;

  return step.run('create-task-and-dispatch', async () => {
    const headers = makePostgrestHeaders(supabaseKey);

    const archetypeRes = await fetch(
      `${supabaseUrl}/rest/v1/archetypes?role_name=eq.${archetypeSlug}&tenant_id=eq.${tenantId}&status=eq.active&deleted_at=is.null&select=id`,
      { headers },
    );
    const archetypes = (await archetypeRes.json()) as Array<{ id: string }>;
    if (!archetypes.length) {
      throw new Error(`Archetype not found: ${archetypeSlug}`);
    }
    const archetypeId = archetypes[0].id;

    const dupRes = await fetch(
      `${supabaseUrl}/rest/v1/tasks?external_id=eq.${externalId}&status=not.in.(Done,Failed,Cancelled)&tenant_id=eq.${tenantId}&select=id`,
      { headers },
    );
    const duplicates = (await dupRes.json()) as Array<{ id: string }>;
    if (duplicates.length > 0) {
      log.info(
        { externalId, tenantId, archetypeSlug },
        'Duplicate task suppressed — skipping dispatch',
      );
      return { taskId: null, archetypeId: null };
    }

    const createRes = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: randomUUID(),
        archetype_id: archetypeId,
        external_id: externalId,
        source_system: sourceSystem,
        status: 'Ready',
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
      }),
    });
    const tasks = (await createRes.json()) as Array<{ id: string }>;
    const taskId = tasks[0].id;
    log.info({ taskId, tenantId, archetypeSlug }, 'Task created');

    await inngest.send({
      name: 'employee/task.dispatched',
      data: { taskId, archetypeId },
      id: `employee-dispatch-${externalId}`,
    });
    log.info({ taskId, tenantId }, 'task.dispatched event sent');

    return { taskId, archetypeId };
  });
}
