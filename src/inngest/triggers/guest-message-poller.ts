import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { createLogger } from '../../lib/logger.js';
import { createTaskAndDispatch } from '../lib/create-task-and-dispatch.js';

const log = createLogger('guest-message-poller');

interface ArchetypeRow {
  id: string;
  tenant_id: string;
}

interface TenantConfigRow {
  id: string;
  config: unknown;
}

export function createGuestMessagePollerTrigger(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'trigger/guest-message-poller',
      triggers: [{ cron: '*/5 * * * *' }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ step }: { step: any }) => {
      const archetypes = await step.run('discover-archetypes', async () => {
        const supabaseUrl = process.env.SUPABASE_URL ?? '';
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';

        const res = await fetch(
          `${supabaseUrl}/rest/v1/archetypes?role_name=eq.guest-messaging&select=id,tenant_id`,
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
        log.info('No guest-messaging archetypes found — skipping');
        return;
      }

      const tenantIds = archetypes.map((a: ArchetypeRow) => a.tenant_id);

      const tenantConfigs = await step.run('fetch-tenant-configs', async () => {
        const supabaseUrl = process.env.SUPABASE_URL ?? '';
        const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';

        const res = await fetch(
          `${supabaseUrl}/rest/v1/tenants?id=in.(${tenantIds.join(',')})&select=id,config`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
          },
        );
        return (await res.json()) as TenantConfigRow[];
      });

      for (const archetype of archetypes) {
        const tenantConfig = tenantConfigs.find(
          (t: TenantConfigRow) => t.id === archetype.tenant_id,
        );
        const config = tenantConfig?.config as Record<string, unknown> | null | undefined;
        const guestConfig = config?.guest_messaging as
          | { poll_interval_minutes?: number }
          | undefined;
        const pollIntervalMinutes = guestConfig?.poll_interval_minutes ?? 30;
        const pollIntervalMs = pollIntervalMinutes * 60 * 1000;
        const slotKey = Math.floor(Date.now() / pollIntervalMs);
        const externalId = `guest-poll-${archetype.tenant_id}-${slotKey}`;

        await createTaskAndDispatch({
          inngest,
          step,
          tenantId: archetype.tenant_id,
          archetypeSlug: 'guest-messaging',
          externalId,
          sourceSystem: 'cron',
        });
      }
    },
  );
}
