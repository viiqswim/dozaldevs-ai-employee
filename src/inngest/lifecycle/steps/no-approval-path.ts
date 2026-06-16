import type { InngestStep } from '../../events.js';
import { createLogger } from '../../../lib/logger.js';
import { patchTask, logStatusTransition } from '../../lib/lifecycle-helpers.js';
import { parseClassifyResponse } from '../../../lib/classify-message.js';
import { buildNoActionThreadBlocks } from '../../../lib/slack-blocks.js';
import { clearPendingApprovalByTaskId } from '../../lib/pending-approvals.js';
import {
  completedNoApprovalMessage,
  missingDeliveryConfigFailureMessage,
} from '../../../lib/slack-copy.js';
import { runDeliveryWithRetry } from './delivery-retry.js';
import { query } from '../../../workers/lib/postgrest-client.js';
import type { PendingApprovalRow } from '../../../workers/lib/postgrest-types.js';
import type { NotifyBlocksOpts, NotifyRef } from './triage-and-ready.js';
import type { KnownBlock } from '@slack/web-api';
import type { NotificationEnrichment } from '../../../lib/types/notification-enrichment.js';
import { loadTenantSlack } from './notify-and-track.js';
import { cleanupExecutionMachine, safeRecordWorkMetric } from './lifecycle-helpers.js';

const log = createLogger('lifecycle-validate-and-submit');

/** Delay in ms between deliverable-fetch retry attempts (1 second) */
const DELIVERABLE_RETRY_DELAY_MS = 1_000;

export interface NoApprovalPathContext {
  taskId: string;
  archetypeId: string;
  tenantId: string;
  supabaseUrl: string;
  supabaseKey: string;
  headers: Record<string, string>;
  taskData: Record<string, unknown>;
  archetype: Record<string, unknown>;
  machineId: string;
  notifyMsgRef: NotifyRef | null;
  notifyBlocks: (opts: NotifyBlocksOpts) => KnownBlock[];
  notifyStateBlocks: (opts: { emoji: string; text: string }) => KnownBlock[];
}

export async function runNoApprovalPath(
  ctx: NoApprovalPathContext,
  step: InngestStep,
): Promise<void> {
  const {
    taskId,
    archetypeId,
    tenantId,
    supabaseUrl,
    supabaseKey,
    headers,
    taskData,
    archetype,
    machineId,
    notifyMsgRef,
    notifyBlocks,
    notifyStateBlocks,
  } = ctx;

  const classificationCheckNoApproval = await step.run(
    'check-classification-no-approval',
    async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=content&order=created_at.desc&limit=1`,
          { headers },
        );
        const rows = (await res.json()) as Array<{ content: string }>;
        if (rows.length > 0) {
          const result = parseClassifyResponse(rows[0].content);
          return {
            skipDelivery:
              result.classification === 'NO_ACTION_NEEDED' && !archetype['delivery_instructions'],
            classification: result.classification,
            reasoning: result.reasoning,
            displayContext: result.displayContext,
          };
        }
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, DELIVERABLE_RETRY_DELAY_MS));
        }
      }
      return {
        skipDelivery: false,
        classification: undefined as 'NEEDS_APPROVAL' | 'NO_ACTION_NEEDED' | undefined,
        reasoning: '',
        displayContext: undefined,
      };
    },
  );

  if (classificationCheckNoApproval.skipDelivery) {
    await step.run('cleanup-execution-machine-no-approval', async () => {
      await cleanupExecutionMachine(machineId, taskId);
    });

    await step.run('post-no-action-thread-no-approval', async () => {
      if (!notifyMsgRef?.ts) return;
      try {
        const slackCtx = await loadTenantSlack(
          tenantId,
          (archetype.notification_channel as string | null) ?? null,
        );
        if (!slackCtx || !slackCtx.channel) return;
        const rawEventForNoAction = (taskData.raw_event as Record<string, string> | null) ?? {};
        await slackCtx.slackClient.postMessage({
          channel: slackCtx.channel,
          text: `ℹ️ No action needed`,
          blocks: buildNoActionThreadBlocks({
            reasoning: classificationCheckNoApproval.reasoning ?? '',
            taskId,
            propertyUid: rawEventForNoAction['property_uid'] ?? undefined,
            leadUid: rawEventForNoAction['lead_uid'] ?? undefined,
          }),
          thread_ts: notifyMsgRef.ts,
        });
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to post no-action thread reply (non-fatal)');
      }
    });

    await step.run('complete-no-action-no-approval', async () => {
      await patchTask(supabaseUrl, headers, taskId, {
        status: 'Done',
        failure_reason: null,
        failure_code: null,
      });
      await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Submitting');
      log.info({ taskId }, 'State: Done (NO_ACTION_NEEDED — no approval required)');
      if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
        try {
          const slackCtx = await loadTenantSlack(
            tenantId,
            (archetype.notification_channel as string | null) ?? null,
          );
          if (slackCtx) {
            await slackCtx.slackClient.updateMessage(
              notifyMsgRef.channel,
              notifyMsgRef.ts,
              `✅ Task complete — no action needed`,
              notifyStateBlocks({ emoji: '✅', text: 'No action needed' }),
            );
          }
        } catch (err) {
          log.warn(
            { taskId, err },
            'Failed to update notify-received on no-action completion (non-fatal)',
          );
        }
      }
    });

    await step.run('record-work-metric-no-action-no-approval', async () => {
      await safeRecordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
    });
    return;
  }

  const deliverableType = (archetype.deliverable_type as string | null) ?? '';
  if (!deliverableType) {
    // The worker produced deliverable content but the employee has no delivery
    // configuration — without this guard the lifecycle would silently complete and
    // the content would never reach the user. Fail visibly so the misconfig surfaces.
    const producedDeliverableContent =
      classificationCheckNoApproval.classification !== undefined &&
      classificationCheckNoApproval.classification !== 'NO_ACTION_NEEDED';
    if (producedDeliverableContent) {
      log.error(
        { taskId, archetypeId },
        'Archetype produced deliverable content but has no deliverable_type — failing instead of silently dropping',
      );
      await step.run('fail-missing-delivery-config', async () => {
        await patchTask(supabaseUrl, headers, taskId, {
          status: 'Failed',
          failure_reason: 'Employee produced output but has no delivery configuration.',
          failure_code: 'MISSING_DELIVERY_CONFIG',
        });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Failed', 'Submitting');
        if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
          try {
            const slackCtx = await loadTenantSlack(
              tenantId,
              (archetype.notification_channel as string | null) ?? null,
            );
            if (slackCtx) {
              await slackCtx.slackClient.updateMessage(
                notifyMsgRef.channel,
                notifyMsgRef.ts,
                missingDeliveryConfigFailureMessage(),
                notifyStateBlocks({ emoji: '❌', text: 'Delivery not configured' }),
              );
            }
          } catch (err) {
            log.warn(
              { taskId, err },
              'Failed to update notify-received on missing-delivery-config failure (non-fatal)',
            );
          }
        }
      });
      await step.run('cleanup-missing-delivery-config', async () => {
        await cleanupExecutionMachine(machineId, taskId);
      });
      return;
    }

    log.warn({ taskId }, 'Archetype has no deliverable_type — skipping delivery container');
    await step.run('complete-no-deliverable-type', async () => {
      await patchTask(supabaseUrl, headers, taskId, {
        status: 'Done',
        failure_reason: null,
        failure_code: null,
      });
      await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Submitting');
      log.info({ taskId }, 'State: Done (no deliverable_type configured)');
      if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
        try {
          const slackCtx = await loadTenantSlack(
            tenantId,
            (archetype.notification_channel as string | null) ?? null,
          );
          if (slackCtx) {
            await slackCtx.slackClient.updateMessage(
              notifyMsgRef.channel,
              notifyMsgRef.ts,
              `✅ Task complete`,
              notifyBlocks({
                state: 'Task complete',
                archetypeName: (archetype.role_name as string) ?? 'unknown',
                enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
                emoji: '✅',
              }),
            );
          }
        } catch (err) {
          log.warn(
            { taskId, err },
            'Failed to update notify-received on no-deliverable completion (non-fatal)',
          );
        }
      }
    });
    await step.run('record-work-metric-no-deliverable-type', async () => {
      await safeRecordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
    });
    await step.run('cleanup-no-deliverable-type', async () => {
      await cleanupExecutionMachine(machineId, taskId);
    });
    return;
  }

  await step.run('cleanup-execution-machine-before-delivery', async () => {
    await cleanupExecutionMachine(machineId, taskId);
  });

  await step.run('delivering-no-approval', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'Delivering' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'Delivering', 'Submitting');
    log.info({ taskId }, 'State: Delivering (no approval required)');
  });

  const noApprovalDeliveryResult = await step.run('run-delivery-no-approval', async () => {
    const slackCtx = await loadTenantSlack(
      tenantId,
      (archetype.notification_channel as string | null) ?? null,
    );
    const tenantEnvForDelivery = slackCtx?.tenantEnv ?? {};
    const taskRawEventForDelivery = (taskData.raw_event as Record<string, string> | null) ?? {};
    return runDeliveryWithRetry({
      taskId,
      tenantId,
      supabaseUrl,
      supabaseKey,
      headers,
      archetype,
      approvalRequired: false,
      notifyMsgRef,
      tenantEnv: tenantEnvForDelivery,
      taskRawEvent: taskRawEventForDelivery,
    });
  });

  if (noApprovalDeliveryResult.status === 'done') {
    await step.run('complete-after-delivery-no-approval', async () => {
      log.info({ taskId }, 'State: Done (delivered — no approval required)');
      if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
        try {
          const slackCtx = await loadTenantSlack(
            tenantId,
            (archetype.notification_channel as string | null) ?? null,
          );
          if (slackCtx) {
            await slackCtx.slackClient.updateMessage(
              notifyMsgRef.channel,
              notifyMsgRef.ts,
              `✅ Task complete`,
              notifyBlocks({
                state: 'Task complete',
                archetypeName: (archetype.role_name as string) ?? 'unknown',
                enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
                emoji: '✅',
              }),
            );
          }
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to update notify-received after delivery (non-fatal)');
        }
      }
      try {
        const approvalCleanupRows = await query<PendingApprovalRow>(
          'pending_approvals',
          `task_id=eq.${taskId}&limit=1`,
        );
        const approvalCardRow = approvalCleanupRows?.[0];
        if (approvalCardRow?.slack_ts && approvalCardRow?.channel_id) {
          const slackCtx = await loadTenantSlack(
            tenantId,
            (archetype.notification_channel as string | null) ?? null,
          );
          if (slackCtx) {
            await slackCtx.slackClient.updateMessage(
              approvalCardRow.channel_id,
              approvalCardRow.slack_ts,
              completedNoApprovalMessage(),
              [
                {
                  type: 'section',
                  text: { type: 'mrkdwn', text: completedNoApprovalMessage() },
                },
                {
                  type: 'context',
                  elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
                },
              ],
            );
            await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
          }
        }
      } catch (err) {
        log.warn(
          { taskId, err },
          '[lifecycle] Failed to clean up stale approval card — continuing',
        );
      }
    });
  }

  await step.run('record-work-metric-after-delivery', async () => {
    await safeRecordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
  });
}
