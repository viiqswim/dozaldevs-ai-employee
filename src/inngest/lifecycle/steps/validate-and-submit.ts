import type { GetStepTools, Inngest } from 'inngest';
import { createLogger } from '../../../lib/logger.js';
import { destroyMachine } from '../../../lib/fly-client.js';
import {
  patchTask,
  logStatusTransition,
  recordWorkMetric,
  stopLocalDockerContainer,
} from '../../lib/lifecycle-helpers.js';
import { parseClassifyResponse } from '../../../lib/classify-message.js';
import {
  buildNoActionThreadBlocks,
  buildOverrideCardBlocks,
  buildSupersededBlocks,
} from '../../../lib/slack-blocks.js';
import {
  clearPendingApprovalByTaskId,
  getPendingApproval,
  trackPendingApproval,
  clearPendingApproval,
} from '../../lib/pending-approvals.js';
import { WORKER_RUNTIME } from '../../../lib/config.js';
import {
  supersededMessage,
  needsReviewMessage,
  reviewingDraftedMessage,
  completedNoApprovalMessage,
  noActionSkippedMessage,
} from '../../../lib/slack-copy.js';
import { runDeliveryWithRetry } from './delivery-retry.js';
import { handleApprove, handleReject, handleSupersede, handleExpiry } from './approval-handler.js';
import { query } from '../../../workers/lib/postgrest-client.js';
import type { PendingApprovalRow } from '../../../workers/lib/postgrest-types.js';
import type { NotifyBlocksOpts, NotifyRef } from './triage-and-ready.js';
import type { KnownBlock } from '@slack/web-api';
import type { NotificationEnrichment } from '../../../lib/types/notification-enrichment.js';
import { loadTenantSlack } from './notify-and-track.js';
import type { TenantSlackContext } from './notify-and-track.js';

const log = createLogger('lifecycle-validate-and-submit');

type InngestStep = GetStepTools<Inngest>;

export interface ValidateContext {
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
  machineId: string;
  timeoutHours: number;
  notifyMsgRef: NotifyRef | null;
  notifyBlocks: (opts: NotifyBlocksOpts) => KnownBlock[];
  notifyStateBlocks: (opts: { emoji: string; text: string }) => KnownBlock[];
  inngest: Inngest;
}

export async function runValidateAndSubmit(ctx: ValidateContext, step: InngestStep): Promise<void> {
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
    machineId,
    timeoutHours,
    notifyMsgRef,
    notifyBlocks,
    notifyStateBlocks,
    inngest,
  } = ctx;

  await step.run('validating', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'Validating' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'Validating', 'Submitting');
    log.info({ taskId }, 'State: Validating (auto-pass)');
  });
  log.info({ taskId, runId, step: 'validating' }, 'Step complete: validating');

  await step.run('submitting', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'Submitting' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'Submitting', 'Validating');
    log.info({ taskId }, 'State: Submitting');
  });
  log.info({ taskId, runId, step: 'submitting' }, 'Step complete: submitting');

  if (!approvalRequired) {
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
              reasoning: result.reasoning,
              displayContext: result.displayContext,
            };
          }
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        return { skipDelivery: false, reasoning: '', displayContext: undefined };
      },
    );

    if (classificationCheckNoApproval.skipDelivery) {
      await step.run('cleanup-execution-machine-no-approval', async () => {
        try {
          if (machineId.startsWith('docker_')) {
            stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
          } else {
            const flyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
            await destroyMachine(flyApp, machineId);
          }
        } catch (err) {
          log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
        }
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
        try {
          await recordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
        } catch (err) {
          log.warn({ err, taskId }, 'Failed to record work metric — non-fatal');
        }
      });
      return;
    }

    const deliverableType = (archetype.deliverable_type as string | null) ?? '';
    if (!deliverableType) {
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
        try {
          await recordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
        } catch (err) {
          log.warn({ err, taskId }, 'Failed to record work metric — non-fatal');
        }
      });
      await step.run('cleanup-no-deliverable-type', async () => {
        try {
          if (machineId.startsWith('docker_')) {
            stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
          } else {
            const flyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
            await destroyMachine(flyApp, machineId);
          }
        } catch (err) {
          log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
        }
      });
      return;
    }

    await step.run('cleanup-execution-machine-before-delivery', async () => {
      try {
        if (machineId.startsWith('docker_')) {
          stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
        } else {
          const flyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
          await destroyMachine(flyApp, machineId);
        }
      } catch (err) {
        log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
      }
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
        approvalRequired,
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
            log.warn(
              { taskId, err },
              'Failed to update notify-received after delivery (non-fatal)',
            );
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
      try {
        await recordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
      } catch (err) {
        log.warn({ err, taskId }, 'Failed to record work metric — non-fatal');
      }
    });
    return;
  }

  const classificationCheck = await step.run('check-classification', async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=content&order=created_at.desc&limit=1`,
        { headers },
      );
      const rows = (await res.json()) as Array<{ content: string }>;
      if (rows.length > 0) {
        const result = parseClassifyResponse(rows[0].content);
        return {
          skipApproval: result.classification === 'NO_ACTION_NEEDED',
          reasoning: result.reasoning,
          displayContext: result.displayContext,
        };
      }
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    return { skipApproval: false, reasoning: '', displayContext: undefined };
  });

  if (classificationCheck.skipApproval) {
    await step.run('cleanup-no-action', async () => {
      try {
        if (machineId.startsWith('docker_')) {
          stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
        } else {
          const flyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
          await destroyMachine(flyApp, machineId);
        }
      } catch (err) {
        log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
      }
    });

    const overrideCardRef = await step.run('post-override-card', async () => {
      try {
        const slackCtx = await loadTenantSlack(
          tenantId,
          (archetype.notification_channel as string | null) ?? null,
        );
        if (!slackCtx || !slackCtx.channel) return { ts: null, channel: null };

        const reasoning = classificationCheck.reasoning ?? '';
        const displayContext = classificationCheck.displayContext ?? {};
        const roleName = (archetype.role_name as string) ?? 'unknown';
        const rawEventForCard = (taskData.raw_event as Record<string, string> | null) ?? {};

        if (notifyMsgRef?.ts) {
          await slackCtx.slackClient.postMessage({
            channel: slackCtx.channel,
            text: `ℹ️ No action needed`,
            blocks: buildNoActionThreadBlocks({
              reasoning,
              taskId,
              propertyUid: rawEventForCard['property_uid'] ?? undefined,
              leadUid: rawEventForCard['lead_uid'] ?? undefined,
            }),
            thread_ts: notifyMsgRef.ts,
          });
        }

        const blocks = buildOverrideCardBlocks({
          reasoning,
          taskId,
          roleName,
          displayContext: Object.keys(displayContext).length > 0 ? displayContext : undefined,
        });

        const result = await slackCtx.slackClient.postMessage({
          channel: slackCtx.channel,
          text: noActionSkippedMessage(roleName, reasoning || undefined),
          blocks,
          thread_ts: notifyMsgRef?.ts ?? undefined,
        });

        await fetch(
          `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&order=created_at.desc&limit=1`,
          {
            method: 'PATCH',
            headers: { ...headers, Prefer: 'return=minimal' },
            body: JSON.stringify({
              metadata: {
                override_card_ts: result.ts,
                override_card_channel: slackCtx.channel,
              },
            }),
          },
        );

        return { ts: result.ts, channel: slackCtx.channel };
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to post override card (non-fatal)');
        return { ts: null, channel: null };
      }
    });

    const overrideEvent = await step.waitForEvent('wait-for-override', {
      event: 'employee/override.requested',
      match: 'data.taskId',
      timeout: `${timeoutHours}h`,
    });

    const resolvedText = `✅ Task complete — no action needed`;

    const updateOverrideCard = async (text: string, slackCtx: TenantSlackContext) => {
      if (overrideCardRef?.ts && overrideCardRef?.channel) {
        try {
          await slackCtx.slackClient.updateMessage(
            overrideCardRef.channel,
            overrideCardRef.ts,
            text,
            [
              { type: 'section', text: { type: 'mrkdwn', text } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ],
          );
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to update override card (non-fatal)');
        }
      }
    };

    const updateNotifyMsg = async (
      text: string,
      slackCtx: TenantSlackContext,
      blocks?: unknown[],
    ) => {
      if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
        try {
          await slackCtx.slackClient.updateMessage(
            notifyMsgRef.channel,
            notifyMsgRef.ts,
            text,
            blocks ?? [
              { type: 'section', text: { type: 'mrkdwn', text } },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
              },
            ],
          );
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to update notify-received message (non-fatal)');
        }
      }
    };

    if (!overrideEvent) {
      await step.run('complete-no-action-timeout', async () => {
        await patchTask(supabaseUrl, headers, taskId, {
          status: 'Done',
          failure_reason: null,
          failure_code: null,
        });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Submitting');
        log.info({ taskId }, 'State: Done (NO_ACTION_NEEDED — timeout, no override)');
        try {
          const slackCtx = await loadTenantSlack(
            tenantId,
            (archetype.notification_channel as string | null) ?? null,
          );
          if (slackCtx) {
            await updateNotifyMsg(
              resolvedText,
              slackCtx,
              notifyStateBlocks({ emoji: '✅', text: 'No action needed' }),
            );
            await updateOverrideCard(resolvedText, slackCtx);
          }
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to update Slack on no-action timeout (non-fatal)');
        }
      });
      await step.run('record-work-metric-no-action', async () => {
        try {
          await recordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
        } catch (err) {
          log.warn({ err, taskId }, 'Failed to record work metric — non-fatal');
        }
      });
      return;
    }

    const overrideData = overrideEvent.data as {
      taskId: string;
      direction: string | null;
      userId: string;
      userName: string;
    };

    if (!overrideData.direction) {
      await step.run('complete-override-dismissed', async () => {
        await patchTask(supabaseUrl, headers, taskId, {
          status: 'Done',
          failure_reason: null,
          failure_code: null,
        });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Submitting');
        log.info({ taskId, userId: overrideData.userId }, 'State: Done (override dismissed)');
        try {
          const slackCtx = await loadTenantSlack(
            tenantId,
            (archetype.notification_channel as string | null) ?? null,
          );
          if (slackCtx) {
            await updateNotifyMsg(
              resolvedText,
              slackCtx,
              notifyStateBlocks({
                emoji: '✅',
                text: 'No action needed — dismissed',
              }),
            );
          }
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to update Slack on override dismiss (non-fatal)');
        }
      });
      await step.run('record-work-metric-override-dismissed', async () => {
        try {
          await recordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
        } catch (err) {
          log.warn({ err, taskId }, 'Failed to record work metric — non-fatal');
        }
      });
      return;
    }

    await step.run('create-override-task', async () => {
      const newTaskRes = await fetch(`${supabaseUrl}/rest/v1/tasks`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          archetype_id: archetypeId,
          tenant_id: tenantId,
          source_system: 'override',
          external_id: `override-${taskId}`,
          status: 'Ready',
          raw_event: { override_of_task_id: taskId, direction: overrideData.direction },
          metadata: {
            override_direction: overrideData.direction,
            overridden_by: overrideData.userId,
            override_of_task_id: taskId,
          },
        }),
      });
      const newTaskRows = (await newTaskRes.json()) as Array<{ id: string }>;
      const newTaskId = newTaskRows[0]?.id;
      if (!newTaskId) {
        log.error({ taskId }, 'Failed to create override task — no id returned');
        return;
      }

      await patchTask(supabaseUrl, headers, taskId, {
        status: 'Done',
        failure_reason: null,
        failure_code: null,
        metadata: {
          overridden_no_action: true,
          override_task_id: newTaskId,
          override_by: overrideData.userId,
          override_at: new Date().toISOString(),
        },
      });
      await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Submitting');
      log.info(
        { taskId, newTaskId, userId: overrideData.userId },
        'Override task created — original task Done',
      );

      await inngest.send({
        name: 'employee/task.dispatched',
        data: { taskId: newTaskId, archetypeId },
      });
    });
    return;
  }

  await step.run('check-supersede', async () => {
    const rawEventData = (taskData.raw_event as Record<string, string> | null) ?? {};
    const authoritativeThreadUid = rawEventData['thread_uid'];

    const delivRes = await fetch(
      `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=metadata&order=created_at.desc&limit=1`,
      { headers },
    );
    const delivRows = (await delivRes.json()) as Array<{
      metadata: Record<string, unknown> | null;
    }>;
    const delivMeta = (delivRows[0]?.metadata as Record<string, unknown>) ?? {};
    const conversationRef = delivMeta.conversation_ref as string | undefined;

    if (!conversationRef && !authoritativeThreadUid) return;

    const lookupKey = authoritativeThreadUid ?? conversationRef!;
    const pending = await getPendingApproval(supabaseUrl, supabaseKey, tenantId, lookupKey);

    let oldTaskId: string | null = null;
    let oldApprovalMsgTs: string | null = null;
    let oldApprovalChannel: string | null = null;

    if (pending && pending.taskId !== taskId) {
      const oldTaskRes = await fetch(
        `${supabaseUrl}/rest/v1/tasks?id=eq.${pending.taskId}&select=status`,
        { headers },
      );
      const oldTaskRows = (await oldTaskRes.json()) as Array<{ status: string }>;
      const oldTaskStatus = oldTaskRows[0]?.status;

      if (!['Reviewing', 'Cancelled'].includes(oldTaskStatus)) {
        log.info(
          { taskId, oldTaskId: pending.taskId, oldTaskStatus },
          'Stale pending approval found (PM already acted on old task) — clearing without supersede',
        );
        await clearPendingApproval(supabaseUrl, supabaseKey, tenantId, lookupKey);
        return;
      }

      oldTaskId = pending.taskId;
      oldApprovalMsgTs = pending.slackTs;
      oldApprovalChannel = pending.channelId;
    } else if (!pending || pending.taskId === taskId) {
      const fallbackRes = await fetch(
        `${supabaseUrl}/rest/v1/tasks?tenant_id=eq.${tenantId}&status=in.(Reviewing,Cancelled)&id=neq.${taskId}&select=id,status&order=created_at.desc&limit=5`,
        { headers },
      );
      const fallbackRows = (await fallbackRes.json()) as Array<{
        id: string;
        status: string;
      }>;

      for (const candidate of fallbackRows) {
        const candEventRes = await fetch(
          `${supabaseUrl}/rest/v1/tasks?id=eq.${candidate.id}&select=raw_event`,
          { headers },
        );
        const candEventRows = (await candEventRes.json()) as Array<{
          raw_event: Record<string, unknown> | null;
        }>;
        const candThreadUid = candEventRows[0]?.raw_event?.['thread_uid'] as string | undefined;
        if (candThreadUid === lookupKey) {
          oldTaskId = candidate.id;
          break;
        }
      }

      if (!oldTaskId) return;

      const oldDelivRes = await fetch(
        `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${oldTaskId}&select=metadata&order=created_at.desc&limit=1`,
        { headers },
      );
      const oldDelivRows = (await oldDelivRes.json()) as Array<{
        metadata: Record<string, unknown> | null;
      }>;
      const oldDelivMeta = (oldDelivRows[0]?.metadata as Record<string, unknown>) ?? {};
      oldApprovalMsgTs = (oldDelivMeta.approval_message_ts as string | undefined) ?? null;
      oldApprovalChannel = (oldDelivMeta.target_channel as string | undefined) ?? null;

      log.info(
        { taskId, oldTaskId, conversationRef, source: 'fallback-task-lookup' },
        'Superseding old task via fallback lookup (no pending_approvals record)',
      );
    }

    if (!oldTaskId) return;

    log.info({ taskId, oldTaskId, conversationRef }, 'Superseding old task for same conversation');

    if (oldApprovalMsgTs && oldApprovalChannel) {
      try {
        const slackCtx = await loadTenantSlack(tenantId, null);
        if (slackCtx) {
          await slackCtx.slackClient.updateMessage(
            oldApprovalChannel,
            oldApprovalMsgTs,
            supersededMessage(),
            buildSupersededBlocks(oldTaskId),
          );
        }
      } catch (err) {
        log.warn({ taskId, oldTaskId, err }, 'Failed to update superseded Slack card (non-fatal)');
      }
    }

    try {
      const oldNudgeFetchRes = await fetch(
        `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${oldTaskId}&select=metadata&order=created_at.desc&limit=1`,
        { headers },
      );
      const oldNudgeFetchRows = (await oldNudgeFetchRes.json()) as Array<{
        metadata: Record<string, unknown> | null;
      }>;
      const oldNudgeMeta = (oldNudgeFetchRows[0]?.metadata as Record<string, unknown>) ?? {};
      const supersededNudgeTs = oldNudgeMeta.nudge_ts as string | undefined;
      const supersededNudgeChannel = oldNudgeMeta.nudge_channel as string | undefined;
      if (supersededNudgeTs && supersededNudgeChannel) {
        const slackCtx = await loadTenantSlack(tenantId, null);
        if (slackCtx) {
          const { WebClient } = await import('@slack/web-api');
          const web = new WebClient(slackCtx.botToken);
          await web.chat.delete({ channel: supersededNudgeChannel, ts: supersededNudgeTs });
          log.info({ taskId, supersededNudgeTs }, 'Superseded nudge broadcast deleted');
        }
      }
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to delete superseded nudge broadcast (non-fatal)');
    }

    await inngest.send({
      name: 'employee/approval.received',
      data: {
        taskId: oldTaskId,
        action: 'superseded',
        userId: 'system',
        userName: 'System (superseded)',
      },
    });
  });

  await step.run('set-reviewing', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'Reviewing' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'Reviewing', 'Submitting');
    log.info({ taskId }, 'State: Reviewing — awaiting human approval');
  });

  await step.run('update-notify-reviewing', async () => {
    if (!notifyMsgRef?.ts || !notifyMsgRef?.channel) return;
    try {
      const slackCtx = await loadTenantSlack(
        tenantId,
        (archetype.notification_channel as string | null) ?? null,
      );
      if (!slackCtx) return;
      const reviewingDelivRes = await fetch(
        `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=metadata&order=created_at.desc&limit=1`,
        { headers },
      );
      const reviewingDelivRows = (await reviewingDelivRes.json()) as Array<{
        metadata: Record<string, unknown> | null;
      }>;
      const reviewingRecipientName = reviewingDelivRows[0]?.metadata?.['recipient_name'] as
        | string
        | undefined;
      const reviewingText = reviewingDraftedMessage(reviewingRecipientName);
      const reviewingBlocks = notifyBlocks({
        state: 'Reviewing',
        archetypeName: (archetype.role_name as string) ?? 'unknown',
        enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
        emoji: '⏳',
      });
      await slackCtx.slackClient.updateMessage(
        notifyMsgRef.channel,
        notifyMsgRef.ts,
        reviewingText,
        reviewingBlocks,
      );
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to update notify-received on reviewing (non-fatal)');
    }
  });

  await step.run('track-pending-approval', async () => {
    const rawEventForTracking = (taskData.raw_event as Record<string, string> | null) ?? {};
    const authoritativeThreadUid = rawEventForTracking['thread_uid'];

    const delivRes = await fetch(
      `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=metadata&order=created_at.desc&limit=1`,
      { headers },
    );
    const delivRows = (await delivRes.json()) as Array<{
      metadata: Record<string, unknown> | null;
    }>;
    const delivMeta = (delivRows[0]?.metadata as Record<string, unknown>) ?? {};
    const conversationRef = delivMeta.conversation_ref as string | undefined;
    const approvalMsgTs = delivMeta.approval_message_ts as string | undefined;
    const targetChannel = delivMeta.target_channel as string | undefined;

    const threadUidForTracking = authoritativeThreadUid ?? conversationRef;

    if (!approvalMsgTs || !targetChannel) {
      log.warn(
        { taskId, approvalMsgTs, targetChannel },
        'track-pending-approval: Missing approval_message_ts or target_channel — approval card was not posted. Task will proceed to wait-for-approval but may timeout.',
      );
      return;
    }

    const threadUid = threadUidForTracking ?? taskId;

    await trackPendingApproval(supabaseUrl, supabaseKey, {
      tenantId,
      threadUid,
      taskId,
      slackTs: approvalMsgTs,
      channelId: targetChannel,
      recipientName: delivMeta.recipient_name as string | undefined,
      contextLabel: delivMeta.property_name as string | undefined,
      urgency: delivMeta.urgency as boolean | undefined,
    });
    log.info({ taskId, threadUid }, 'Pending approval tracked');

    if (archetype.enrichment_adapter && notifyMsgRef?.ts && notifyMsgRef?.channel) {
      try {
        const slackCtx = await loadTenantSlack(
          tenantId,
          (archetype.notification_channel as string | null) ?? null,
        );
        if (slackCtx) {
          const preNudgeStatusRes = await fetch(
            `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`,
            { headers },
          );
          const preNudgeStatusRows = (await preNudgeStatusRes.json()) as Array<{
            status: string;
          }>;
          const preNudgeStatus = preNudgeStatusRows[0]?.status;
          if (preNudgeStatus !== 'Reviewing') {
            log.info(
              { taskId, preNudgeStatus },
              'Task no longer Reviewing before nudge — skipping nudge broadcast',
            );
            return;
          }

          const nudgeRecipientName = delivMeta.recipient_name as string | undefined;
          const nudgePropertyName = delivMeta.property_name as string | undefined;
          const nudgeText = needsReviewMessage(
            nudgeRecipientName
              ? `${nudgeRecipientName}${nudgePropertyName ? ` · ${nudgePropertyName}` : ''}`
              : undefined,
          );

          const { WebClient } = await import('@slack/web-api');
          const web = new WebClient(slackCtx.botToken);
          const nudgeResult = await web.chat.postMessage({
            channel: notifyMsgRef.channel,
            text: nudgeText,
            blocks: notifyBlocks({
              state: 'Reviewing',
              archetypeName: (archetype.role_name as string) ?? 'unknown',
              enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
              emoji: '⏳',
            }) as import('@slack/web-api').Block[],
            thread_ts: notifyMsgRef.ts,
            reply_broadcast: true,
            unfurl_links: false,
          });

          if (nudgeResult.ts) {
            const updatedMeta = {
              ...delivMeta,
              nudge_ts: nudgeResult.ts,
              nudge_channel: notifyMsgRef.channel,
            };
            await fetch(`${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}`, {
              method: 'PATCH',
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                Prefer: 'return=minimal',
              },
              body: JSON.stringify({ metadata: updatedMeta }),
            });
            log.info({ taskId, nudgeTs: nudgeResult.ts }, 'Nudge broadcast posted');

            const postNudgeStatusRes = await fetch(
              `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`,
              { headers },
            );
            const postNudgeStatusRows = (await postNudgeStatusRes.json()) as Array<{
              status: string;
            }>;
            const postNudgeStatus = postNudgeStatusRows[0]?.status;
            if (postNudgeStatus !== 'Reviewing') {
              log.warn(
                { taskId, postNudgeStatus, nudgeTs: nudgeResult.ts },
                'Task superseded during nudge posting — deleting nudge immediately',
              );
              try {
                await web.chat.delete({
                  channel: notifyMsgRef.channel,
                  ts: nudgeResult.ts,
                });
                log.info(
                  { taskId, nudgeTs: nudgeResult.ts },
                  'Orphaned nudge deleted after post-check',
                );
              } catch (delErr) {
                log.warn({ taskId, delErr }, 'Failed to delete orphaned nudge (non-fatal)');
              }
            }
          }
        }
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to post nudge broadcast (non-fatal)');
      }
    }
  });

  const approvalEvent = await step.waitForEvent('wait-for-approval', {
    event: 'employee/approval.received',
    match: 'data.taskId',
    timeout: `${timeoutHours}h`,
  });

  await step.run('handle-approval-result', async () => {
    const slackCtx = await loadTenantSlack(tenantId, null);
    const botToken = slackCtx?.botToken ?? '';
    const slackClient = slackCtx?.slackClient ?? null;
    if (!slackClient) {
      log.warn({ taskId }, 'No Slack client available for approval handling');
      return;
    }

    const delivRes = await fetch(
      `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=*&order=created_at.desc&limit=1`,
      { headers },
    );
    const deliverables = (await delivRes.json()) as Array<Record<string, unknown>>;
    const deliverable = deliverables[0];

    const taskRawEventRes = await fetch(
      `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=raw_event`,
      { headers },
    );
    const taskRawEventRows = (await taskRawEventRes.json()) as Array<{
      raw_event?: Record<string, string> | null;
    }>;
    const taskRawEvent = taskRawEventRows[0]?.raw_event ?? {};

    const metadata = (deliverable?.metadata as Record<string, unknown>) ?? {};
    const nudgeTs = metadata.nudge_ts as string | undefined;
    const nudgeChannel = metadata.nudge_channel as string | undefined;
    if (nudgeTs && nudgeChannel) {
      try {
        const { WebClient } = await import('@slack/web-api');
        const web = new WebClient(botToken);
        await web.chat.delete({ channel: nudgeChannel, ts: nudgeTs });
        log.info({ taskId, nudgeTs }, 'Nudge broadcast deleted');
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to delete nudge broadcast (non-fatal)');
      }
    }

    const approvalCtx = {
      taskId,
      tenantId,
      archetypeId,
      supabaseUrl,
      supabaseKey,
      headers,
      archetype,
      notifyMsgRef,
      notifyBlocks,
      notifyStateBlocks,
      inngest,
      runDelivery: runDeliveryWithRetry,
    };

    if (!approvalEvent) {
      await handleExpiry(approvalCtx, deliverable, slackClient);
      return;
    }

    const {
      action,
      userId: actorUserId,
      editedContent,
      rejectionReason,
    } = approvalEvent.data as {
      action: string;
      userId: string;
      editedContent?: string;
      rejectionReason?: string;
    };

    if (action === 'approve') {
      await handleApprove(
        approvalCtx,
        deliverable,
        slackClient,
        actorUserId,
        editedContent,
        taskRawEvent,
      );
    } else if (action === 'superseded') {
      await handleSupersede(approvalCtx, deliverable, slackClient, botToken);
    } else {
      await handleReject(approvalCtx, deliverable, slackClient, actorUserId, rejectionReason);
    }
  });
  log.info(
    { taskId, runId, step: 'handle-approval-result' },
    'Step complete: handle-approval-result',
  );

  await step.run('record-work-metric-approval', async () => {
    try {
      const taskStatusRes = await fetch(
        `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`,
        { headers },
      );
      const taskStatusRows = (await taskStatusRes.json()) as Array<{ status: string }>;
      if (taskStatusRows[0]?.status === 'Done') {
        await recordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
      }
    } catch (err) {
      log.warn({ err, taskId }, 'Failed to record work metric — non-fatal');
    }
  });

  await step.run('cleanup', async () => {
    try {
      if (WORKER_RUNTIME !== 'fly' || machineId.startsWith('docker_')) {
        stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
      } else {
        const flyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
        await destroyMachine(flyApp, machineId);
      }
    } catch (err) {
      log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
    }
  });
}
