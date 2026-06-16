import type { InngestStep } from '../../events.js';
import { createLogger } from '../../../lib/logger.js';
import { destroyMachine } from '../../../lib/fly-client.js';
import {
  patchTask,
  logStatusTransition,
  recordWorkMetric,
  stopLocalDockerContainer,
} from '../../lib/lifecycle-helpers.js';
import { query } from '../../../workers/lib/postgrest-client.js';
import type { TaskRow } from '../../../workers/lib/postgrest-types.js';
import type { NotifyBlocksOpts, NotifyRef } from './triage-and-ready.js';
import type { KnownBlock } from '@slack/web-api';
import type { NotificationEnrichment } from '../../../lib/types/notification-enrichment.js';
import { loadTenantSlack } from './notify-and-track.js';
import { provisionWorkerMachine } from '../lib/machine-provisioner.js';

const log = createLogger('lifecycle-execute');

/** Number of status polls before giving up — 120 × 15s = 30 min max execution window */
const MAX_EXECUTION_POLLS = 120;
/** Interval between task-status polls in milliseconds (15 seconds) */
const POLL_INTERVAL_MS = 15_000;

export interface ExecuteContext {
  taskId: string;
  archetypeId: string;
  tenantId: string;
  runId: string;
  supabaseUrl: string;
  supabaseKey: string;
  headers: Record<string, string>;
  taskData: Record<string, unknown>;
  archetype: Record<string, unknown>;
  approvalRequired: boolean;
  notifyMsgRef: NotifyRef | null;
  notifyBlocks: (opts: NotifyBlocksOpts) => KnownBlock[];
}

export type ExecuteResult =
  | { outcome: 'submitting'; machineId: string }
  | { outcome: 'terminated' };

export async function runExecutePhase(
  ctx: ExecuteContext,
  step: InngestStep,
): Promise<ExecuteResult> {
  const {
    taskId,
    archetypeId,
    tenantId,
    runId,
    supabaseUrl,
    supabaseKey,
    headers,
    taskData,
    archetype,
    approvalRequired,
    notifyMsgRef,
    notifyBlocks,
  } = ctx;

  const machineId = await step.run('executing', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'Executing' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'Executing', 'Ready');
    log.info({ taskId }, 'State: Executing — provisioning machine');

    return provisionWorkerMachine({
      taskId,
      archetypeId,
      tenantId,
      runId,
      supabaseUrl,
      supabaseKey,
      headers,
      taskData,
      archetype,
      approvalRequired,
      notifyMsgRef,
    });
  });
  log.info({ taskId, runId, step: 'executing' }, 'Step complete: executing');

  const finalStatus = await step.run('poll-completion', async () => {
    const maxPolls = MAX_EXECUTION_POLLS;
    const intervalMs = POLL_INTERVAL_MS;

    for (let i = 0; i < maxPolls; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      const rows = await query<Pick<TaskRow, 'status'>>('tasks', `id=eq.${taskId}&select=status`);
      const status = rows?.[0]?.status;
      log.debug({ taskId, poll: i, status }, 'Polling for completion');
      if (status === 'Submitting' || status === 'Failed' || status === 'Cancelled') return status;
    }
    return 'Failed';
  });
  log.info({ taskId, runId, step: 'poll-completion' }, 'Step complete: poll-completion');

  if (finalStatus === 'Cancelled') {
    log.info({ taskId }, 'Task was cancelled (superseded) — stopping ghost worker');
    await step.run('mark-cancelled', async () => {
      if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
        try {
          const slackCtx = await loadTenantSlack(
            tenantId,
            (archetype.notification_channel as string | null) ?? null,
          );
          if (slackCtx) {
            const { slackClient: slackForCancelled } = slackCtx;
            const supersededText = `⏭️ Superseded — a newer request came in`;
            const supersededNotifyBlocks = notifyBlocks({
              state: 'Superseded',
              archetypeName: (archetype.role_name as string) ?? 'unknown',
              enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
              emoji: '⏭️',
            });
            await slackForCancelled.updateMessage(
              notifyMsgRef.channel,
              notifyMsgRef.ts,
              supersededText,
              supersededNotifyBlocks,
            );
          }
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to update notify-received on cancellation (non-fatal)');
        }
      }
    });
    await step.run('cleanup-on-cancellation', async () => {
      try {
        if ((machineId as string).startsWith('docker_')) {
          stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
        } else {
          const flyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
          await destroyMachine(flyApp, machineId as string);
        }
      } catch (err) {
        log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
      }
    });
    return { outcome: 'terminated' };
  }

  if (finalStatus === 'Failed') {
    log.error({ taskId }, 'Task failed in machine');
    await step.run('mark-failed', async () => {
      await patchTask(supabaseUrl, headers, taskId, { status: 'Failed' });
      await logStatusTransition(supabaseUrl, headers, taskId, 'Failed', 'Executing');
      if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
        try {
          const slackCtx = await loadTenantSlack(
            tenantId,
            (archetype.notification_channel as string | null) ?? null,
          );
          if (slackCtx) {
            const { slackClient: slackForFail } = slackCtx;
            const failText = `❌ Something went wrong — *${(archetype.role_name as string) ?? 'unknown'}* ran into a problem`;
            const taskForFailReasonRes = await fetch(
              `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=failure_reason`,
              { headers },
            );
            const taskForFailReasonData = taskForFailReasonRes.ok
              ? ((await taskForFailReasonRes.json()) as Array<{ failure_reason: string | null }>)
              : [];
            const failureReason = taskForFailReasonData[0]?.failure_reason ?? undefined;
            const notifyFailedBlocks = notifyBlocks({
              state: 'Failed',
              archetypeName: (archetype.role_name as string) ?? 'unknown',
              enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
              emoji: '❌',
              extraText: failureReason,
            });
            await slackForFail.updateMessage(
              notifyMsgRef.channel,
              notifyMsgRef.ts,
              failText,
              notifyFailedBlocks,
            );
          }
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to update notify-received on failure (non-fatal)');
        }
      }
      try {
        await recordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
      } catch (err) {
        log.warn({ err, taskId }, 'Failed to record work metric on failure — non-fatal');
      }
    });
    await step.run('cleanup-on-failure', async () => {
      try {
        if ((machineId as string).startsWith('docker_')) {
          stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
        } else {
          const flyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
          await destroyMachine(flyApp, machineId as string);
        }
      } catch (err) {
        log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
      }
    });
    return { outcome: 'terminated' };
  }

  return { outcome: 'submitting', machineId: machineId as string };
}
