import { NonRetriableError } from 'inngest';
import type { InngestStep } from '../../events.js';
import { createSlackClient } from '../../../lib/slack-client.js';
import { createLogger } from '../../../lib/logger.js';
import { patchTask, logStatusTransition } from '../../lib/lifecycle-helpers.js';
import { mergeTaskMetadata } from './lifecycle-helpers.js';
import { getAdapter } from '../../../lib/enrichment-adapters/index.js';
import type { NotificationEnrichment } from '../../../lib/types/notification-enrichment.js';
import type { KnownBlock } from '@slack/web-api';
import { loadTenantSlack } from './notify-and-track.js';

const log = createLogger('lifecycle-triage-and-ready');

export interface NotifyBlocksOpts {
  state: string;
  archetypeName: string;
  enrichment?: NotificationEnrichment | null;
  emoji?: string;
  extraText?: string;
  sentSnippet?: string;
  threadHint?: boolean;
}

export interface NotifyRef {
  ts: string | null;
  channel: string | null;
  enrichment?: unknown;
}

export interface TriageContext {
  taskId: string;
  archetypeId: string;
  runId: string;
  supabaseUrl: string;
  supabaseKey: string;
  headers: Record<string, string>;
}

export interface TriageResult {
  taskData: Record<string, unknown>;
  archetype: Record<string, unknown>;
  riskModel: Record<string, unknown>;
  approvalRequired: boolean;
  timeoutHours: number;
  tenantId: string;
  notifyMsgRef: NotifyRef | null;
}

export async function runTriageAndReady(
  ctx: TriageContext,
  step: InngestStep,
  notifyBlocks: (opts: NotifyBlocksOpts) => KnownBlock[],
): Promise<TriageResult> {
  const { taskId, runId, supabaseUrl, headers } = ctx;

  const taskData = await step.run('load-task', async () => {
    const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=*,archetypes(*)`, {
      headers,
    });
    const rows = (await res.json()) as Array<Record<string, unknown>>;
    if (!rows.length) throw new NonRetriableError(`Task not found: ${taskId}`);
    return rows[0];
  });

  const archetype = (taskData.archetypes as Record<string, unknown>) ?? {};
  const riskModel = (archetype.risk_model as Record<string, unknown>) ?? {};
  const approvalRequired = riskModel.approval_required === true;
  log.info(
    {
      taskId,
      runId,
      step: 'load-task',
      archetypeId: archetype['id'] as string,
      roleName: archetype['role_name'] as string,
      approvalRequired,
    },
    'Step complete: load-task',
  );
  const timeoutHours = (riskModel.timeout_hours as number) ?? 24;
  const tenantId = taskData.tenant_id as string | undefined;
  if (!tenantId) {
    throw new Error('Task is missing tenant_id — cannot proceed with lifecycle');
  }

  await step.run('triaging', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'Triaging' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'Triaging', 'Received');
    log.info({ taskId }, 'State: Triaging (auto-pass)');
  });
  log.info({ taskId, runId, step: 'triaging' }, 'Step complete: triaging');

  const notifyMsgRef = await step.run('notify-received', async () => {
    try {
      const slackCtx = await loadTenantSlack(
        tenantId,
        (archetype.notification_channel as string | null) ?? null,
      );
      if (!slackCtx) return { ts: null, channel: null, enrichment: null };

      const { botToken, channel, slackClient: slackClientForNotify } = slackCtx;
      const roleName = (archetype.role_name as string) ?? 'unknown';
      const rawEventForSupersede = (taskData.raw_event as Record<string, unknown> | null) ?? {};
      const supersededNotifyTs = rawEventForSupersede['superseded_notify_ts'] as string | undefined;
      const supersededNotifyChannel = rawEventForSupersede['superseded_notify_channel'] as
        | string
        | undefined;

      let enrichment: NotificationEnrichment | null = null;
      if (archetype.enrichment_adapter) {
        try {
          await import('../../../lib/enrichment-adapters/all.js');
          const adapter = getAdapter(archetype.enrichment_adapter as string);
          if (adapter) {
            enrichment = await adapter(
              (taskData.raw_event as Record<string, unknown>) ?? {},
              slackCtx.tenantEnv as Record<string, string>,
            );
          }
        } catch (enrichErr) {
          log.warn({ taskId, enrichErr }, 'Enrichment adapter failed (non-fatal)');
        }
      }

      const blocks = notifyBlocks({
        state: 'Received',
        archetypeName: roleName,
        enrichment,
        emoji: '⏳',
      });

      if (supersededNotifyTs && supersededNotifyChannel) {
        try {
          const slackForSupersede = createSlackClient({ botToken, defaultChannel: channel });
          await slackForSupersede.updateMessage(
            supersededNotifyChannel,
            supersededNotifyTs,
            `⏳ On it — *${roleName}* is working on it`,
            blocks,
          );
          try {
            await mergeTaskMetadata(supabaseUrl, headers, taskId, {
              notify_slack_ts: supersededNotifyTs,
              notify_slack_channel: supersededNotifyChannel,
            });
          } catch (metaErr) {
            log.warn(
              { taskId, metaErr },
              'Failed to store superseded notify_slack_ts in task metadata (non-fatal)',
            );
          }
          return { ts: supersededNotifyTs, channel: supersededNotifyChannel, enrichment };
        } catch (err) {
          log.warn(
            { taskId, err },
            'chat.update failed for superseded thread — falling back to new top-level message',
          );
        }
      }

      const result = await slackClientForNotify.postMessage({
        channel,
        text: `⏳ On it — *${roleName}* is working on it`,
        blocks,
        unfurl_links: false,
      });

      if (result.ts) {
        try {
          await mergeTaskMetadata(supabaseUrl, headers, taskId, {
            notify_slack_ts: result.ts,
            notify_slack_channel: channel,
            inngest_run_id: runId,
          });
          log.info({ taskId }, 'notify_slack_ts stored in task metadata');
        } catch (err) {
          log.warn({ taskId, err }, 'Error storing notify_slack_ts in task metadata (non-fatal)');
        }
      }
      return { ts: result.ts, channel, enrichment };
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to send received notification (non-fatal)');
      return { ts: null, channel: null };
    }
  });
  log.info(
    { taskId, runId, step: 'notify-received', channel: notifyMsgRef?.channel },
    'Step complete: notify-received',
  );

  await step.run('awaiting-input', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'AwaitingInput' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'AwaitingInput', 'Triaging');
    log.info({ taskId }, 'State: AwaitingInput (auto-pass)');
  });

  await step.run('ready', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'Ready' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'Ready', 'AwaitingInput');
    log.info({ taskId }, 'State: Ready');
  });

  return {
    taskData,
    archetype,
    riskModel,
    approvalRequired,
    timeoutHours,
    tenantId,
    notifyMsgRef: notifyMsgRef as NotifyRef | null,
  };
}
