import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { createLogger } from '../../lib/logger.js';
import { decrypt } from '../../lib/encryption.js';
import { requireEnv } from '../../lib/config.js';
import type { InngestStep } from '../events.js';
import { makePostgrestHeaders } from '../lib/postgrest-headers.js';

const log = createLogger('guest-message-poll');

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseKey = requireEnv('SUPABASE_SECRET_KEY');

const HOSTFULLY_BASE_URL = 'https://api.hostfully.com/api/v3.2';

const LEAD_LOOKBACK_DAYS = 30;
const LEAD_LOOKBACK_MS = LEAD_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

interface ArchetypeRow {
  id: string;
  tenant_id: string;
}

interface SecretRow {
  key: string;
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

interface RawLead {
  uid: string;
  type?: string;
}

interface RawMessage {
  senderType?: string;
  createdUtcDateTime?: string;
}

export function createGuestMessagePollTrigger(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'trigger/guest-message-poll',
      triggers: [{ cron: '*/15 * * * *' }],
    },
    async ({ step }: { step: InngestStep }) => {
      const today = new Date().toISOString().slice(0, 10);

      const archetypes = await step.run('discover-archetypes', async () => {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/archetypes?role_name=eq.guest-messaging&status=eq.active&deleted_at=is.null&select=id,tenant_id`,
          { headers: makePostgrestHeaders(supabaseKey) },
        );
        return (await res.json()) as ArchetypeRow[];
      });

      if (!archetypes.length) {
        log.info('No guest-messaging archetypes found — skipping poll');
        return;
      }

      for (const archetype of archetypes) {
        const unrespondedLeadUids = await step.run(
          `fetch-unresponded-${archetype.tenant_id}`,
          async () => {
            if (process.env.HOSTFULLY_MOCK === 'true') {
              log.info(
                { tenantId: archetype.tenant_id },
                'HOSTFULLY_MOCK=true — skipping poll for tenant',
              );
              return [] as string[];
            }

            const pgHeaders = makePostgrestHeaders(supabaseKey);

            const secretRes = await fetch(
              `${supabaseUrl}/rest/v1/tenant_secrets?tenant_id=eq.${archetype.tenant_id}&key=in.(hostfully_api_key,hostfully_agency_uid)`,
              { headers: pgHeaders },
            );
            const secretRows = (await secretRes.json()) as SecretRow[];

            const secrets: Record<string, string> = {};
            for (const row of secretRows) {
              try {
                secrets[row.key] = decrypt(row);
              } catch {
                log.warn(
                  { tenantId: archetype.tenant_id, key: row.key },
                  'Failed to decrypt secret',
                );
              }
            }

            const apiKey = secrets['hostfully_api_key'];
            const agencyUid = secrets['hostfully_agency_uid'];

            if (!apiKey || !agencyUid) {
              log.warn(
                { tenantId: archetype.tenant_id },
                'Hostfully API key or agency UID missing — skipping poll for tenant',
              );
              return [] as string[];
            }

            const hfHeaders = { 'X-HOSTFULLY-APIKEY': apiKey, Accept: 'application/json' };

            const thirtyDaysAgo = new Date(Date.now() - LEAD_LOOKBACK_MS)
              .toISOString()
              .slice(0, 10);

            const leadsRes = await fetch(
              `${HOSTFULLY_BASE_URL}/leads?agencyUid=${encodeURIComponent(agencyUid)}&checkInFrom=${thirtyDaysAgo}`,
              { headers: hfHeaders },
            );

            if (!leadsRes.ok) {
              log.error(
                { tenantId: archetype.tenant_id, status: leadsRes.status },
                'Failed to fetch Hostfully leads',
              );
              return [] as string[];
            }

            const leadsJson = (await leadsRes.json()) as { leads?: RawLead[] };
            const allLeads = leadsJson.leads ?? [];

            // Exclude calendar blocks only — include BOOKING, INQUIRY, BOOKING_REQUEST, etc.
            // Airbnb and other OTAs may surface real stays as INQUIRY type, not just BOOKING.
            const eligibleLeads = allLeads.filter((l) => l.type !== 'BLOCK');

            const unresponded: string[] = [];

            for (const lead of eligibleLeads) {
              const msgRes = await fetch(
                `${HOSTFULLY_BASE_URL}/messages?leadUid=${encodeURIComponent(lead.uid)}&_limit=5`,
                { headers: hfHeaders },
              );

              if (!msgRes.ok) continue;

              const msgJson = (await msgRes.json()) as { messages?: RawMessage[] };
              const messages = msgJson.messages ?? [];
              if (messages.length === 0) continue;

              // API returns newest-first — first message is the most recent
              const latestMessage = messages[0];
              if (latestMessage?.senderType && latestMessage.senderType !== 'AGENCY') {
                unresponded.push(lead.uid);
              }
            }

            log.info(
              {
                tenantId: archetype.tenant_id,
                totalLeads: eligibleLeads.length,
                unrespondedCount: unresponded.length,
              },
              'Hostfully poll complete',
            );

            return unresponded;
          },
        );

        // Create a task per unresponded lead (unique step name per lead avoids Inngest step ID collisions)
        for (let i = 0; i < unrespondedLeadUids.length; i++) {
          const leadUid = unrespondedLeadUids[i];
          const externalId = `hostfully-poll-${leadUid}-${today}`;

          await step.run(`create-task-${archetype.tenant_id}-${i}`, async () => {
            const headers = makePostgrestHeaders(supabaseKey);

            const dupRes = await fetch(
              `${supabaseUrl}/rest/v1/tasks?external_id=eq.${externalId}&status=not.in.(Done,Failed,Cancelled)&tenant_id=eq.${archetype.tenant_id}&select=id`,
              { headers },
            );
            const duplicates = (await dupRes.json()) as Array<{ id: string }>;
            if (duplicates.length > 0) {
              log.info({ externalId, leadUid }, 'Polling task already exists for lead — skipping');
              return null;
            }

            // Cross-namespace check: skip if a webhook-created task is active for this lead
            const activeTaskRes = await fetch(
              `${supabaseUrl}/rest/v1/tasks?archetype_id=eq.${archetype.id}&status=not.in.(Done,Failed,Cancelled)&tenant_id=eq.${archetype.tenant_id}&raw_event->>lead_uid=eq.${leadUid}&select=id,external_id`,
              { headers },
            );
            const activeTasks = (await activeTaskRes.json()) as Array<{
              id: string;
              external_id: string;
            }>;
            if (activeTasks.length > 0) {
              log.info(
                {
                  leadUid,
                  existingTaskId: activeTasks[0].id,
                  existingExternalId: activeTasks[0].external_id,
                },
                'Active task already exists for lead (cross-namespace check) — skipping',
              );
              return null;
            }

            const createRes = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                archetype_id: archetype.id,
                external_id: externalId,
                source_system: 'cron',
                status: 'Ready',
                tenant_id: archetype.tenant_id,
                raw_event: { lead_uid: leadUid, source: 'poll' },
              }),
            });

            const tasks = (await createRes.json()) as Array<{ id: string }>;
            const taskId = tasks?.[0]?.id;
            if (!taskId) return null;

            await inngest.send({
              name: 'employee/task.dispatched',
              data: { taskId, archetypeId: archetype.id },
              id: `employee-dispatch-${externalId}`,
            });

            log.info({ taskId, leadUid, externalId }, 'Created polling task for unresponded lead');
            return taskId;
          });
        }
      }
    },
  );
}
