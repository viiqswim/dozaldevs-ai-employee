import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { createLogger } from '../../lib/logger.js';
import { createTaskAndDispatch } from '../lib/create-task-and-dispatch.js';

const log = createLogger('monitor-trigger');

interface ArchetypeRow {
  id: string;
  tenant_id: string;
}

export function createMonitorTrigger(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'trigger/unresponded-message-monitor',
      triggers: [{ cron: '*/30 * * * *' }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ step }: { step: any }) => {
      const archetypes = await step.run('discover-archetypes', async () => {
        const supabaseUrl = process.env.SUPABASE_URL ?? '';
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';

        const res = await fetch(
          `${supabaseUrl}/rest/v1/archetypes?role_name=eq.unresponded-message-monitor&select=id,tenant_id`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        return (await res.json()) as ArchetypeRow[];
      });

      if (!archetypes.length) {
        log.info('No unresponded-message-monitor archetypes found — skipping');
        return;
      }

      for (const archetype of archetypes) {
        await createTaskAndDispatch({
          inngest,
          step,
          tenantId: archetype.tenant_id,
          archetypeSlug: 'unresponded-message-monitor',
          externalId: `monitor-${archetype.tenant_id}`,
          sourceSystem: 'cron',
        });
      }
    },
  );
}
