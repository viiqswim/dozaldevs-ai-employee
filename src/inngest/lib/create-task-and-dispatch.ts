import type { Inngest } from 'inngest';

export interface CreateTaskAndDispatchParams {
  inngest: Inngest;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  step: any;
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
  const { inngest, step, archetypeSlug, externalId, sourceSystem } = params;

  return step.run('create-task-and-dispatch', async () => {
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY!;
    const tenantId = '00000000-0000-0000-0000-000000000001';

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };

    const archetypeRes = await fetch(
      `${supabaseUrl}/rest/v1/archetypes?role_name=eq.${archetypeSlug}&tenant_id=eq.${tenantId}&select=id`,
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
      return { taskId: null, archetypeId: null };
    }

    const createRes = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        archetype_id: archetypeId,
        external_id: externalId,
        source_system: sourceSystem,
        status: 'Ready',
        tenant_id: tenantId,
      }),
    });
    const tasks = (await createRes.json()) as Array<{ id: string }>;
    const taskId = tasks[0].id;

    await inngest.send({
      name: 'employee/task.dispatched',
      data: { taskId, archetypeId },
      id: `employee-dispatch-${externalId}`,
    });

    return { taskId, archetypeId };
  });
}
