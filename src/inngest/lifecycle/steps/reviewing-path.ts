import type { Inngest } from 'inngest';
import type { InngestStep } from '../../events.js';
import { createLogger } from '../../../lib/logger.js';
import {
  patchTask,
  logStatusTransition,
  recordWorkMetric,
  stopLocalDockerContainer,
} from '../../lib/lifecycle-helpers.js';
import {
  clearPendingApproval,
  getPendingApproval,
  trackPendingApproval,
} from '../../lib/pending-approvals.js';
import { WORKER_RUNTIME } from '../../../lib/config.js';
import { makePostgrestHeaders } from '../../lib/postgrest-headers.js';
import {
  supersededMessage,
  needsReviewMessage,
  reviewingDraftedMessage,
} from '../../../lib/slack-copy.js';
import { buildSupersededBlocks } from '../../../lib/slack-blocks.js';
import { destroyMachine } from '../../../lib/fly-client.js';
import { runDeliveryWithRetry } from './delivery-retry.js';
import { handleApprove, handleSupersede, handleExpiry } from './approval-handler.js';
import { handleReject } from './approval-handler-reject.js';
import type { NotifyBlocksOpts, NotifyRef } from './triage-and-ready.js';
import type { KnownBlock } from '@slack/web-api';
import type { NotificationEnrichment } from '../../../lib/types/notification-enrichment.js';
import { loadTenantSlack } from './notify-and-track.js';

const log = createLogger('lifecycle-validate-and-submit');

export interface ReviewingPathContext {
  taskId: string;
  archetypeId: string;
  tenantId: string;
  runId: string;
  supabaseUrl: string;
  supabaseKey: string;
  headers: Record<string, string>;
  taskData: Record<string, unknown>;
  archetype: Record<string, unknown>;
  machineId: string;
  timeoutHours: number;
  notifyMsgRef: NotifyRef | null;
  notifyBlocks: (opts: NotifyBlocksOpts) => KnownBlock[];
  notifyStateBlocks: (opts: { emoji: string; text: string }) => KnownBlock[];
  inngest: Inngest;
}

export async function runReviewingPath(
  ctx: ReviewingPathContext,
  step: InngestStep,
): Promise<void> {
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
    machineId,
    timeoutHours,
    notifyMsgRef,
    notifyBlocks,
    notifyStateBlocks,
    inngest,
  } = ctx;

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
              headers: { ...makePostgrestHeaders(supabaseKey), Prefer: 'return=minimal' },
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
