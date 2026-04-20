import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { createLogger } from '../../lib/logger.js';
import { createTaskAndDispatch } from '../lib/create-task-and-dispatch.js';

const log = createLogger('summarizer-trigger');

interface ArchetypeRow {
  id: string;
  tenant_id: string;
}

export function createSummarizerTrigger(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'trigger/daily-summarizer',
      triggers: [{ cron: '0 8 * * 1-5' }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ step }: { step: any }) => {
      const today = new Date().toISOString().slice(0, 10);

      const archetypes = await step.run('discover-archetypes', async () => {
        const supabaseUrl = process.env.SUPABASE_URL ?? '';
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';

        const res = await fetch(
          `${supabaseUrl}/rest/v1/archetypes?role_name=eq.daily-summarizer&select=id,tenant_id`,
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
        log.info('No daily-summarizer archetypes found — skipping');
        return;
      }

      for (const archetype of archetypes) {
        await createTaskAndDispatch({
          inngest,
          step,
          tenantId: archetype.tenant_id,
          archetypeSlug: 'daily-summarizer',
          externalId: `summary-${today}`,
          sourceSystem: 'cron',
        });
      }
    },
  );
}
