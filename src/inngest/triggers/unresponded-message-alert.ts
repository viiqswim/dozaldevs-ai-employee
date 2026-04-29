import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { createLogger } from '../../lib/logger.js';
import { getStaleApprovals, markReminderSent } from '../lib/pending-approvals.js';
import { shouldSendReminder, DEFAULT_QUIET_HOURS } from '../lib/quiet-hours.js';
import type { QuietHoursConfig } from '../lib/quiet-hours.js';
import { buildReminderBlocks } from '../lib/reminder-blocks.js';
import type { ReminderThread } from '../lib/reminder-blocks.js';
import { decrypt } from '../../lib/encryption.js';
import { createSlackClient } from '../../lib/slack-client.js';
import { resolveNotificationChannel } from '../../gateway/services/notification-channel.js';

const log = createLogger('unresponded-message-alert');

interface ArchetypeRow {
  id: string;
  tenant_id: string;
  notification_channel: string | null | undefined;
}

interface TenantConfigRow {
  id: string;
  config: unknown;
}

interface TenantSecretRow {
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

export function createUnrespondedMessageAlertTrigger(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'trigger/unresponded-message-alerter',
      triggers: [{ cron: '*/5 * * * *' }],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async ({ step }: { step: any }) => {
      const supabaseUrl = process.env.SUPABASE_URL ?? '';
      const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? '';

      const archetypes = await step.run('discover-archetypes', async () => {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/archetypes?role_name=eq.guest-messaging&select=id,tenant_id,notification_channel`,
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
        log.info('No guest-messaging archetypes found — skipping unresponded message alert');
        return;
      }

      const tenantIds = archetypes.map((a: ArchetypeRow) => a.tenant_id);

      const tenantConfigs = await step.run('fetch-tenant-configs', async () => {
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
        await step.run(`check-tenant-${archetype.tenant_id}`, async () => {
          const tenantConfig = tenantConfigs.find(
            (t: TenantConfigRow) => t.id === archetype.tenant_id,
          );
          const config = tenantConfig?.config as Record<string, unknown> | null | undefined;
          const guestConfig = config?.guest_messaging as
            | { alert_threshold_minutes?: number; quiet_hours?: QuietHoursConfig }
            | undefined;

          const thresholdMinutes = guestConfig?.alert_threshold_minutes ?? 30;
          const quietHoursConfig: QuietHoursConfig =
            guestConfig?.quiet_hours ?? DEFAULT_QUIET_HOURS;

          const staleApprovals = await getStaleApprovals(
            supabaseUrl,
            supabaseKey,
            archetype.tenant_id,
            thresholdMinutes,
          );

          if (!staleApprovals.length) {
            log.info({ tenantId: archetype.tenant_id }, 'No stale approvals — skipping');
            return;
          }

          const qualifyingApprovals = staleApprovals.filter((approval) =>
            shouldSendReminder(Date.now(), quietHoursConfig, approval.urgency ?? false),
          );

          if (!qualifyingApprovals.length) {
            log.info(
              { tenantId: archetype.tenant_id },
              'All stale approvals suppressed by quiet hours — skipping',
            );
            return;
          }

          const threads: ReminderThread[] = qualifyingApprovals.map((approval) => ({
            threadUid: approval.threadUid,
            guestName: approval.guestName ?? 'Unknown Guest',
            propertyName: approval.propertyName ?? 'Unknown Property',
            elapsedMinutes: Math.floor(
              (Date.now() - new Date(approval.createdAt).getTime()) / 60000,
            ),
            permalink:
              'https://slack.com/archives/' +
              approval.channelId +
              '/p' +
              approval.slackTs.replace('.', ''),
          }));

          const blocks = buildReminderBlocks(threads);

          const secretRes = await fetch(
            `${supabaseUrl}/rest/v1/tenant_secrets?tenant_id=eq.${archetype.tenant_id}&key=eq.slack_bot_token&select=ciphertext,iv,auth_tag&limit=1`,
            {
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
              },
            },
          );
          const secrets = (await secretRes.json()) as TenantSecretRow[];
          if (!secrets.length) {
            log.warn({ tenantId: archetype.tenant_id }, 'No slack_bot_token found — skipping');
            return;
          }
          const botToken = decrypt({
            ciphertext: secrets[0].ciphertext,
            iv: secrets[0].iv,
            auth_tag: secrets[0].auth_tag,
          });

          const tenantCfg = tenantConfig?.config as Record<string, unknown> | undefined;
          const channel = resolveNotificationChannel(
            archetype,
            tenantCfg?.notification_channel
              ? { notification_channel: tenantCfg.notification_channel as string }
              : {},
          );

          if (!channel) {
            log.warn(
              { tenantId: archetype.tenant_id },
              'No notification channel configured — skipping',
            );
            return;
          }

          const fallbackText = `⏰ ${qualifyingApprovals.length} unresponded message(s) awaiting action`;

          const slackClient = createSlackClient({ botToken, defaultChannel: channel });
          await slackClient.postMessage({ text: fallbackText, blocks, channel });

          await markReminderSent(
            supabaseUrl,
            supabaseKey,
            qualifyingApprovals.map((a) => a.id),
          );

          log.info(
            { tenantId: archetype.tenant_id, reminderCount: qualifyingApprovals.length },
            'Unresponded message reminder sent',
          );
        });
      }
    },
  );
}
