/**
 * Reviewing-state watchdog.
 *
 * Tasks that reach `Reviewing` but whose worker posted an error (not a proper
 * approval card) end up with no `pending_approvals` row. The lifecycle's
 * `step.waitForEvent('wait-for-approval')` will eventually time-out after
 * `timeoutHours`, but that can be 24 h. This cron fires every 15 minutes and
 * marks truly abandoned tasks `Failed` early so they don't silently pile up.
 *
 * A task is considered a zombie when ALL are true:
 *   1. status === 'Reviewing'
 *   2. updated_at is older than ZOMBIE_THRESHOLD_MINUTES (default 30 min)
 *   3. No row in `pending_approvals` references that task_id
 *
 * Tasks with a valid `pending_approvals` row are left alone — a PM may still
 * click Approve/Reject on their Slack card.
 */
import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { loadTenantEnv } from '../../repositories/tenant-env-loader.js';
import { TenantRepository } from '../../repositories/tenant-repository.js';
import { TenantSecretRepository } from '../../repositories/tenant-secret-repository.js';
import { createSlackClient } from '../../lib/slack-client.js';
import { watchdogFailureMessage } from '../../lib/slack-copy.js';
import type { InngestStep } from '../events.js';
import { requireEnv } from '../../lib/config.js';

const log = createLogger('reviewing-watchdog');

const supabaseUrl = requireEnv('SUPABASE_URL');
const supabaseKey = requireEnv('SUPABASE_SECRET_KEY');

const ZOMBIE_THRESHOLD_MINUTES = 30;

interface TaskRow {
  id: string;
  tenant_id: string;
  status: string;
  updated_at: string;
  metadata: Record<string, unknown> | null;
}

interface PendingApprovalRow {
  id: string;
}

function makeHeaders(supabaseKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    apikey: supabaseKey,
    Authorization: `Bearer ${supabaseKey}`,
  };
}

export function createReviewingWatchdogTrigger(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'trigger/reviewing-watchdog',
      triggers: [{ cron: '*/15 * * * *' }],
    },
    async ({ step }: { step: InngestStep }) => {
      if (!supabaseUrl || !supabaseKey) {
        log.warn('SUPABASE_URL or SUPABASE_SECRET_KEY not set — skipping reviewing watchdog');
        return { zombiesFound: 0, zombiesResolved: 0 };
      }

      const headers = makeHeaders(supabaseKey);

      const cutoff = new Date(Date.now() - ZOMBIE_THRESHOLD_MINUTES * 60 * 1000).toISOString();

      const reviewingTasks = await step.run('load-reviewing-tasks', async () => {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/tasks?status=eq.Reviewing&updated_at=lt.${encodeURIComponent(cutoff)}&select=id,tenant_id,status,updated_at,metadata`,
          { headers },
        );
        if (!res.ok) {
          log.warn({ status: res.status }, 'Watchdog: failed to query tasks');
          return [] as TaskRow[];
        }
        return (await res.json()) as TaskRow[];
      });

      if (reviewingTasks.length === 0) {
        log.info('Reviewing watchdog: no stuck tasks found');
        return { zombiesFound: 0, zombiesResolved: 0 };
      }

      log.info(
        { count: reviewingTasks.length },
        'Reviewing watchdog: checking tasks for pending_approvals',
      );

      let zombiesFound = 0;
      let zombiesResolved = 0;

      for (const task of reviewingTasks) {
        const resolved = await step.run(`check-task-${task.id}`, async () => {
          const paRes = await fetch(
            `${supabaseUrl}/rest/v1/pending_approvals?task_id=eq.${encodeURIComponent(task.id)}&select=id&limit=1`,
            { headers },
          );
          const paRows = paRes.ok ? ((await paRes.json()) as PendingApprovalRow[]) : [];

          if (paRows.length > 0) {
            log.info(
              { taskId: task.id },
              'Reviewing watchdog: task has pending_approvals, skipping',
            );
            return false;
          }
          log.warn(
            { taskId: task.id, tenantId: task.tenant_id, updatedAt: task.updated_at },
            'Reviewing watchdog: zombie task detected — no pending_approvals row',
          );

          const patchRes = await fetch(
            `${supabaseUrl}/rest/v1/tasks?id=eq.${encodeURIComponent(task.id)}`,
            {
              method: 'PATCH',
              headers: { ...headers, Prefer: 'return=minimal' },
              body: JSON.stringify({
                status: 'Failed',
                failure_reason:
                  'Task stuck in Reviewing with no approval card for >' +
                  ZOMBIE_THRESHOLD_MINUTES +
                  ' minutes. Worker likely posted an error instead of an approval card.',
                updated_at: new Date().toISOString(),
              }),
            },
          );

          if (!patchRes.ok) {
            log.warn(
              { taskId: task.id, status: patchRes.status },
              'Reviewing watchdog: failed to patch task to Failed',
            );
            return false;
          }

          await fetch(`${supabaseUrl}/rest/v1/task_status_log`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              task_id: task.id,
              from_status: 'Reviewing',
              to_status: 'Failed',
              actor: 'reviewing-watchdog',
            }),
          });

          try {
            const notifyTs = task.metadata?.notify_slack_ts as string | undefined;
            const notifyChannel = task.metadata?.notify_slack_channel as string | undefined;
            if (!notifyTs || !notifyChannel) {
              log.info(
                { taskId: task.id },
                'Reviewing watchdog: no notify message to update — skipping Slack update',
              );
            } else {
              const prismaForSlack = new PrismaClient();
              let botToken: string | undefined;
              try {
                const tenantEnv = await loadTenantEnv(
                  task.tenant_id,
                  {
                    tenantRepo: new TenantRepository(prismaForSlack),
                    secretRepo: new TenantSecretRepository(prismaForSlack),
                  },
                  null,
                );
                botToken = tenantEnv['SLACK_BOT_TOKEN'] ?? undefined;
              } finally {
                await prismaForSlack.$disconnect();
              }
              if (!botToken) {
                log.warn(
                  { taskId: task.id, tenantId: task.tenant_id },
                  'Reviewing watchdog: no SLACK_BOT_TOKEN — skipping Slack update',
                );
              } else {
                const slackClient = createSlackClient({ botToken, defaultChannel: '' });
                const failText = watchdogFailureMessage();
                await slackClient.updateMessage(notifyChannel, notifyTs, failText, [
                  { type: 'section', text: { type: 'mrkdwn', text: failText } },
                  {
                    type: 'context',
                    elements: [{ type: 'mrkdwn', text: `Task \`${task.id}\`` }],
                  },
                ]);
                log.info(
                  { taskId: task.id },
                  'Reviewing watchdog: updated frozen notify message to ❌',
                );
              }
            }
          } catch (err) {
            log.warn(
              { taskId: task.id, err },
              'Reviewing watchdog: failed to update Slack notify message (non-fatal)',
            );
          }

          log.info({ taskId: task.id }, 'Reviewing watchdog: zombie task marked Failed');
          return true;
        });

        zombiesFound++;
        if (resolved) zombiesResolved++;
      }

      const result = { zombiesFound, zombiesResolved };
      log.info(result, 'Reviewing watchdog run complete');
      return result;
    },
  );
}
