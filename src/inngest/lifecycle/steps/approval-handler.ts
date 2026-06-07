import type { Inngest } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { createSlackClient } from '../../../lib/slack-client.js';
import { createLogger } from '../../../lib/logger.js';
import {
  buildSupersededBlocks,
  buildEnrichedTerminalBlocks,
  buildContextThreadBlocks,
} from '../../../lib/slack-blocks.js';
import { supersededMessage, expiredMessage } from '../../../lib/slack-copy.js';
import { clearPendingApprovalByTaskId } from '../../lib/pending-approvals.js';
import { patchTask, logStatusTransition } from '../../lib/lifecycle-helpers.js';
import { loadTenantEnv, TenantRepository, TenantSecretRepository } from '../../lib/tenant-env.js';
import type { KnownBlock } from '@slack/web-api';
import type { NotificationEnrichment } from '../../../lib/types/notification-enrichment.js';
import type { runDeliveryWithRetry } from './delivery-retry.js';

const log = createLogger('lifecycle-approval-handler');

export interface ApprovalHandlerContext {
  taskId: string;
  tenantId: string;
  archetypeId: string;
  supabaseUrl: string;
  supabaseKey: string;
  headers: Record<string, string>;
  archetype: Record<string, unknown>;
  notifyMsgRef: { ts: string | null; channel: string | null; enrichment?: unknown } | null;
  notifyBlocks: (opts: {
    state: string;
    archetypeName: string;
    enrichment?: NotificationEnrichment | null;
    emoji?: string;
    extraText?: string;
    sentSnippet?: string;
    threadHint?: boolean;
  }) => KnownBlock[];
  notifyStateBlocks: (opts: { emoji: string; text: string }) => KnownBlock[];
  inngest: Inngest;
  runDelivery: typeof runDeliveryWithRetry;
}

export interface ApprovalEventData {
  action: string;
  userId: string;
  editedContent?: string;
  rejectionReason?: string;
}

export async function handleExpiry(
  ctx: ApprovalHandlerContext,
  deliverable: Record<string, unknown> | undefined,
  slackClient: ReturnType<typeof createSlackClient>,
): Promise<void> {
  const { taskId, supabaseUrl, supabaseKey, headers, archetype, notifyMsgRef, notifyBlocks } = ctx;
  const metadata = (deliverable?.metadata as Record<string, unknown>) ?? {};
  const approvalMsgTs = metadata.approval_message_ts as string | undefined;
  const targetChannel = metadata.target_channel as string | undefined;

  if (approvalMsgTs && targetChannel) {
    try {
      const expiryText = expiredMessage();
      const expiryGuestName = metadata['guest_name'] as string | undefined;
      const expiryCardBlocks = expiryGuestName
        ? buildEnrichedTerminalBlocks({
            status: 'expired',
            guestName: expiryGuestName,
            propertyName: metadata['property_name'] as string | undefined,
            threadUid: metadata['thread_uid'] as string | undefined,
            leadUid: metadata['lead_uid'] as string | undefined,
            taskId,
          })
        : [
            { type: 'section', text: { type: 'mrkdwn', text: expiryText } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ];
      await slackClient.updateMessage(
        targetChannel,
        approvalMsgTs,
        expiryText,
        expiryCardBlocks as KnownBlock[],
      );
    } catch (err) {
      log.warn(
        { taskId, approvalMsgTs, targetChannel, err },
        'Expiry message update failed (non-fatal)',
      );
    }
  }
  if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
    try {
      const expiredNotifyText = expiredMessage();
      const notifyExpiryBlocks = notifyBlocks({
        state: 'Expired',
        archetypeName: (archetype.role_name as string) ?? 'unknown',
        enrichment: notifyMsgRef.enrichment ?? null,
        emoji: '⏰',
      });
      await slackClient.updateMessage(
        notifyMsgRef.channel,
        notifyMsgRef.ts,
        expiredNotifyText,
        notifyExpiryBlocks,
      );
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to update notify-received on expiry (non-fatal)');
    }
  }
  await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
  await patchTask(supabaseUrl, headers, taskId, { status: 'Cancelled' });
  await logStatusTransition(supabaseUrl, headers, taskId, 'Cancelled', 'Reviewing');
}

export async function handleSupersede(
  ctx: ApprovalHandlerContext,
  deliverable: Record<string, unknown> | undefined,
  slackClient: ReturnType<typeof createSlackClient>,
  botToken: string,
): Promise<void> {
  const { taskId, supabaseUrl, supabaseKey, headers, archetype, notifyMsgRef, notifyBlocks } = ctx;
  const metadata = (deliverable?.metadata as Record<string, unknown>) ?? {};
  const approvalMsgTs = metadata.approval_message_ts as string | undefined;
  const targetChannel = metadata.target_channel as string | undefined;

  log.info({ taskId }, 'Task superseded by newer message for same conversation');
  if (approvalMsgTs && targetChannel) {
    try {
      await slackClient.updateMessage(
        targetChannel,
        approvalMsgTs,
        supersededMessage(),
        buildSupersededBlocks(taskId),
      );
    } catch (err) {
      log.warn(
        { taskId, approvalMsgTs, targetChannel, err },
        'Superseded message update failed (non-fatal)',
      );
    }
  }
  if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
    try {
      const supersededNotifyText = supersededMessage();
      const supersededNotifyBlocks = notifyBlocks({
        state: 'Superseded',
        archetypeName: (archetype.role_name as string) ?? 'unknown',
        enrichment: notifyMsgRef.enrichment ?? null,
        emoji: '⏭️',
      });
      await slackClient.updateMessage(
        notifyMsgRef.channel,
        notifyMsgRef.ts,
        supersededNotifyText,
        supersededNotifyBlocks,
      );
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to update notify-received on supersede (non-fatal)');
    }
  }
  await patchTask(supabaseUrl, headers, taskId, { status: 'Cancelled' });
  await logStatusTransition(supabaseUrl, headers, taskId, 'Cancelled', 'Reviewing');
  log.info({ taskId }, 'State: Cancelled (superseded)');
  await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
  try {
    const nudgeRetryRes = await fetch(
      `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=metadata&order=created_at.desc&limit=1`,
      { headers },
    );
    const nudgeRetryRows = (await nudgeRetryRes.json()) as Array<{
      metadata: Record<string, unknown> | null;
    }>;
    const nudgeRetryMeta = (nudgeRetryRows[0]?.metadata as Record<string, unknown>) ?? {};
    const retryNudgeTs = nudgeRetryMeta.nudge_ts as string | undefined;
    const retryNudgeChannel = nudgeRetryMeta.nudge_channel as string | undefined;
    if (retryNudgeTs && retryNudgeChannel) {
      const { WebClient } = await import('@slack/web-api');
      const web = new WebClient(botToken);
      await web.chat.delete({ channel: retryNudgeChannel, ts: retryNudgeTs });
      log.info({ taskId, retryNudgeTs }, 'Supersede branch: orphaned nudge deleted on re-read');
    }
  } catch (err) {
    log.warn({ taskId, err }, 'Supersede branch: failed to clean up nudge on re-read (non-fatal)');
  }
}

export async function handleReject(
  ctx: ApprovalHandlerContext,
  deliverable: Record<string, unknown> | undefined,
  slackClient: ReturnType<typeof createSlackClient>,
  actorUserId: string,
  rejectionReason: string | undefined,
): Promise<void> {
  const {
    taskId,
    tenantId,
    archetypeId,
    supabaseUrl,
    supabaseKey,
    headers,
    archetype,
    notifyMsgRef,
    notifyBlocks,
    inngest,
  } = ctx;
  const metadata = (deliverable?.metadata as Record<string, unknown>) ?? {};
  const approvalMsgTs = metadata.approval_message_ts as string | undefined;
  const targetChannel = (metadata.target_channel as string) ?? '';

  if (rejectionReason) {
    try {
      const currentMetadata =
        (
          (await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=metadata`, {
            headers,
          }).then((r) => r.json())) as Array<{ metadata: Record<string, unknown> | null }>
        )[0]?.metadata ?? {};

      const updatedMetadata = { ...currentMetadata, rejectionReason };
      const metaPatchRes = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          metadata: updatedMetadata,
          updated_at: new Date().toISOString(),
        }),
      });
      if (!metaPatchRes.ok) {
        log.warn({ taskId }, 'Failed to store rejectionReason in task metadata (non-fatal)');
      } else {
        log.info({ taskId }, 'Rejection reason stored in task metadata');
      }
    } catch (err) {
      log.warn({ taskId, err }, 'Error storing rejectionReason in task metadata (non-fatal)');
    }
  }

  if (rejectionReason) {
    try {
      const feedbackEvtRes = await fetch(`${supabaseUrl}/rest/v1/feedback_events`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          archetype_id: archetypeId,
          task_id: taskId,
          event_type: 'rejection_reason',
          correction_content: rejectionReason,
          actor_id: actorUserId,
        }),
      });
      if (!feedbackEvtRes.ok) {
        const body = await feedbackEvtRes.text();
        log.warn(
          { taskId, status: feedbackEvtRes.status, body },
          'Failed to store rejection_reason in feedback_events (non-fatal)',
        );
      } else {
        log.info({ taskId }, 'rejection_reason feedback_event written');
      }
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to store rejection_reason in feedback_events (non-fatal)');
    }
    try {
      await inngest.send({
        name: 'employee/rule.extract-requested',
        data: {
          tenantId,
          feedbackId: null,
          feedbackType: 'rejection_reason',
          taskId,
          archetypeId,
          content: rejectionReason,
          originalContent: null,
          editedContent: null,
          actorUserId,
          approvalMsgTs,
          targetChannel,
        },
      });
      log.info({ taskId }, 'rule.extract-requested fired for rejection_reason');
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to fire rule extraction for rejection_reason (non-fatal)');
    }
  }

  if (approvalMsgTs && targetChannel) {
    const rejectedText = `❌ Rejected by <@${actorUserId}>.`;
    try {
      const rejectedBlocks = buildEnrichedTerminalBlocks({
        status: 'rejected',
        actorUserId,
        guestName: metadata['guest_name'] as string | undefined,
        propertyName: metadata['property_name'] as string | undefined,
        threadUid: metadata['thread_uid'] as string | undefined,
        leadUid: metadata['lead_uid'] as string | undefined,
        taskId,
      });
      await slackClient.updateMessage(
        targetChannel,
        approvalMsgTs,
        rejectedText,
        rejectedBlocks as KnownBlock[],
      );
    } catch (err) {
      log.warn(
        { taskId, approvalMsgTs, targetChannel, err },
        'Rejection message update failed (non-fatal)',
      );
    }
  }
  if (metadata['original_message'] && approvalMsgTs && targetChannel) {
    try {
      const contextBlocks = buildContextThreadBlocks({
        action: 'reject',
        actorUserId,
        guestName: metadata['guest_name'] as string | undefined,
        propertyName: metadata['property_name'] as string | undefined,
        checkIn: metadata['check_in'] as string | undefined,
        checkOut: metadata['check_out'] as string | undefined,
        bookingChannel: metadata['booking_channel'] as string | undefined,
        originalMessage: metadata['original_message'] as string,
        draftResponse: metadata['draft_response'] as string | undefined,
        confidence: typeof metadata['confidence'] === 'number' ? metadata['confidence'] : undefined,
        category: metadata['category'] as string | undefined,
        threadUid: metadata['thread_uid'] as string | undefined,
        leadUid: metadata['lead_uid'] as string | undefined,
        taskId,
      });
      await slackClient.postMessage({
        channel: targetChannel,
        thread_ts: approvalMsgTs,
        text: '📋 Message context preserved for reference',
        blocks: contextBlocks as KnownBlock[],
      });
      log.info({ taskId }, 'Context thread reply posted');
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to post context thread reply (non-fatal)');
    }
  }
  if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
    try {
      const rejectedNotifyText = `❌ Rejected by <@${actorUserId}>.`;
      const notifyRejectBlocks = notifyBlocks({
        state: 'Rejected',
        archetypeName: (archetype.role_name as string) ?? 'unknown',
        enrichment: notifyMsgRef.enrichment ?? null,
        emoji: '❌',
        extraText: `Rejected by <@${actorUserId}>`,
      });
      await slackClient.updateMessage(
        notifyMsgRef.channel,
        notifyMsgRef.ts,
        rejectedNotifyText,
        notifyRejectBlocks as KnownBlock[],
      );
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to update notify-received on rejection (non-fatal)');
    }
  }
  if (rejectionReason && approvalMsgTs && targetChannel) {
    try {
      const learnedText = `📝 Noted: "${rejectionReason}" — I'll apply this next time.`;
      await slackClient.postMessage({
        channel: targetChannel,
        thread_ts: approvalMsgTs,
        text: learnedText,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: learnedText } }],
      });
      log.info({ taskId }, 'Rejection acknowledgment posted in thread');
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to post rejection acknowledgment (non-fatal)');
    }
  }

  try {
    const currentMetaRes = await fetch(
      `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=metadata`,
      { headers },
    );
    const currentMetaRows = (await currentMetaRes.json()) as Array<{
      metadata: Record<string, unknown> | null;
    }>;
    const currentMeta = (currentMetaRows[0]?.metadata as Record<string, unknown>) ?? {};

    const updatedMeta = {
      ...currentMeta,
      rejection_feedback_requested: true,
      rejection_user_id: actorUserId,
    };

    await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        metadata: updatedMeta,
        updated_at: new Date().toISOString(),
      }),
    });
    log.info({ taskId }, 'Rejection feedback flag set in task metadata');
  } catch (err) {
    log.warn({ taskId, err }, 'Failed to set rejection feedback flag (non-fatal)');
  }

  if (!rejectionReason && approvalMsgTs && targetChannel) {
    try {
      const feedbackText = `Got it, <@${actorUserId}>. What should I have done differently?`;
      await slackClient.postMessage({
        channel: targetChannel,
        thread_ts: approvalMsgTs,
        text: feedbackText,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: feedbackText } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
        ],
      });
      log.info({ taskId }, 'Rejection feedback solicitation posted in thread');
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to post rejection feedback solicitation (non-fatal)');
    }
  }

  if (!rejectionReason) {
    try {
      const rejFeedbackEvtRes = await fetch(`${supabaseUrl}/rest/v1/feedback_events`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          archetype_id: archetypeId,
          task_id: taskId,
          event_type: 'rejection',
          actor_id: actorUserId,
        }),
      });
      if (!rejFeedbackEvtRes.ok) {
        const body = await rejFeedbackEvtRes.text();
        log.warn(
          { taskId, status: rejFeedbackEvtRes.status, body },
          'Failed to write rejection feedback_event (non-fatal)',
        );
      } else {
        log.info({ taskId }, 'rejection feedback_event written');
      }
    } catch (err) {
      log.warn({ taskId, err }, 'Error writing rejection feedback_event (non-fatal)');
    }
    try {
      const empRuleRes = await fetch(`${supabaseUrl}/rest/v1/employee_rules`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          archetype_id: archetypeId,
          rule_text: '',
          source: 'rejection',
          status: 'awaiting_input',
          source_task_id: taskId,
        }),
      });
      if (!empRuleRes.ok) {
        const body = await empRuleRes.text();
        log.warn(
          { taskId, status: empRuleRes.status, body },
          'Failed to create awaiting_input employee_rule for rejection (non-fatal)',
        );
      } else {
        log.info({ taskId }, 'awaiting_input employee_rule created for rejection without reason');
      }
    } catch (err) {
      log.warn(
        { taskId, err },
        'Failed to create awaiting_input employee_rule for rejection (non-fatal)',
      );
    }
  }

  await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
  await patchTask(supabaseUrl, headers, taskId, { status: 'Cancelled' });
  await logStatusTransition(supabaseUrl, headers, taskId, 'Cancelled', 'Reviewing');
  log.info({ taskId }, 'State: Cancelled (rejected)');
}

export async function handleApprove(
  ctx: ApprovalHandlerContext,
  deliverable: Record<string, unknown> | undefined,
  slackClient: ReturnType<typeof createSlackClient>,
  actorUserId: string,
  editedContent: string | undefined,
  taskRawEvent: Record<string, string>,
): Promise<void> {
  const {
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
    runDelivery,
  } = ctx;
  const metadata = (deliverable?.metadata as Record<string, unknown>) ?? {};
  const approvalMsgTs = metadata.approval_message_ts as string | undefined;
  const targetChannel = (metadata.target_channel as string) ?? '';

  await patchTask(supabaseUrl, headers, taskId, { status: 'Approved' });
  await logStatusTransition(supabaseUrl, headers, taskId, 'Approved', 'Reviewing');
  log.info({ taskId }, 'State: Approved');

  await patchTask(supabaseUrl, headers, taskId, { status: 'Delivering' });
  await logStatusTransition(supabaseUrl, headers, taskId, 'Delivering', 'Approved');
  log.info({ taskId }, 'State: Delivering');

  if (editedContent) {
    const rawDeliverableContent = deliverable?.content as string | undefined;
    let originalDraft: string | undefined;
    try {
      const parsed = JSON.parse(rawDeliverableContent ?? '{}') as Record<string, unknown>;
      originalDraft = typeof parsed.draft === 'string' ? parsed.draft : rawDeliverableContent;
    } catch {
      originalDraft = rawDeliverableContent;
    }
    try {
      const deliverableId = deliverable?.id as string | undefined;
      if (deliverableId) {
        const currentContent = rawDeliverableContent;
        let updatedContent = currentContent ?? '{}';
        try {
          const parsed = JSON.parse(currentContent ?? '{}') as Record<string, unknown>;
          parsed.draft = editedContent;
          updatedContent = JSON.stringify(parsed);
        } catch {
          updatedContent = JSON.stringify({ draft: editedContent });
        }
        const patchRes = await fetch(`${supabaseUrl}/rest/v1/deliverables?id=eq.${deliverableId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            content: updatedContent,
            updated_at: new Date().toISOString(),
          }),
        });
        if (!patchRes.ok) {
          log.warn(
            { taskId, deliverableId },
            'Failed to patch deliverable content with editedContent (non-fatal)',
          );
        } else {
          log.info({ taskId, deliverableId }, 'Deliverable content patched with editedContent');
        }
      }
    } catch (err) {
      log.warn(
        { taskId, err },
        'Error patching deliverable content with editedContent (non-fatal)',
      );
    }
    try {
      const currentMetaRows = (await fetch(
        `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=metadata`,
        { headers },
      ).then((r) => r.json())) as Array<{ metadata: Record<string, unknown> | null }>;
      const existingMeta = currentMetaRows[0]?.metadata ?? {};
      await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          metadata: { ...existingMeta, draft_response: editedContent },
          updated_at: new Date().toISOString(),
        }),
      });
      log.info({ taskId }, 'Task metadata draft_response updated with editedContent');
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to update task metadata draft_response (non-fatal)');
    }
    try {
      const feedbackEvtRes = await fetch(`${supabaseUrl}/rest/v1/feedback_events`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          archetype_id: archetypeId,
          task_id: taskId,
          event_type: 'edit_diff',
          correction_content: editedContent,
          original_content: originalDraft ?? null,
          actor_id: actorUserId,
        }),
      });
      if (!feedbackEvtRes.ok) {
        const body = await feedbackEvtRes.text();
        log.warn(
          { taskId, status: feedbackEvtRes.status, body },
          'Failed to write edit_diff feedback_event (non-fatal)',
        );
      } else {
        log.info({ taskId }, 'edit_diff feedback_event written');
      }
    } catch (err) {
      log.warn({ taskId, err }, 'Error writing edit_diff feedback_event (non-fatal)');
    }
    await inngest.send({
      name: 'employee/rule.extract-requested',
      data: {
        tenantId,
        feedbackId: null,
        feedbackType: 'edit_diff',
        taskId,
        archetypeId,
        content: null,
        originalContent: originalDraft ?? '',
        editedContent,
        actorUserId,
        approvalMsgTs,
        targetChannel,
      },
    });
  }

  const archetypeRes = await fetch(
    `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=archetypes(delivery_instructions)`,
    { headers },
  );
  const archetypeRows = (await archetypeRes.json()) as Array<{
    archetypes?: { delivery_instructions?: string | null };
  }>;
  const deliveryInstructions = archetypeRows[0]?.archetypes?.delivery_instructions;
  if (!deliveryInstructions) {
    await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
    await patchTask(supabaseUrl, headers, taskId, {
      status: 'Failed',
      failure_reason: 'Archetype missing delivery_instructions',
    });
    const configFailText = `❌ Something went wrong — this employee isn't set up for delivery yet`;
    if (approvalMsgTs && targetChannel) {
      try {
        await slackClient.updateMessage(targetChannel, approvalMsgTs, configFailText, [
          { type: 'section', text: { type: 'mrkdwn', text: configFailText } },
          { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
        ] as KnownBlock[]);
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to update approval card on config error (non-fatal)');
      }
    }
    if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
      try {
        await slackClient.updateMessage(
          notifyMsgRef.channel,
          notifyMsgRef.ts,
          configFailText,
          notifyStateBlocks({
            emoji: '❌',
            text: "Something went wrong — this employee isn't set up for delivery yet",
          }),
        );
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to update notify-received on config error (non-fatal)');
      }
    }
    return;
  }

  if (approvalMsgTs && targetChannel) {
    const approvedText = `✅ Approved by <@${actorUserId}> — delivering now.`;
    try {
      await slackClient.updateMessage(targetChannel, approvalMsgTs, approvedText, [
        { type: 'section', text: { type: 'mrkdwn', text: approvedText } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
      ] as KnownBlock[]);
      log.info({ taskId }, 'Approval message updated');
    } catch (err) {
      log.warn(
        { taskId, approvalMsgTs, targetChannel, err },
        'Approval message update failed (non-fatal) — message may have been deleted',
      );
    }
  }

  if (metadata['original_message'] && approvalMsgTs && targetChannel) {
    try {
      const contextBlocks = buildContextThreadBlocks({
        action: editedContent ? 'edit' : 'approve',
        actorUserId,
        guestName: metadata['guest_name'] as string | undefined,
        propertyName: metadata['property_name'] as string | undefined,
        checkIn: metadata['check_in'] as string | undefined,
        checkOut: metadata['check_out'] as string | undefined,
        bookingChannel: metadata['booking_channel'] as string | undefined,
        originalMessage: metadata['original_message'] as string,
        sentResponse: editedContent ?? (metadata['draft_response'] as string | undefined),
        draftResponse: metadata['draft_response'] as string | undefined,
        editedResponse: editedContent,
        confidence: typeof metadata['confidence'] === 'number' ? metadata['confidence'] : undefined,
        category: metadata['category'] as string | undefined,
        threadUid: metadata['thread_uid'] as string | undefined,
        leadUid: metadata['lead_uid'] as string | undefined,
        taskId,
      });
      await slackClient.postMessage({
        channel: targetChannel,
        thread_ts: approvalMsgTs,
        text: '📋 Message context preserved for reference',
        blocks: contextBlocks as KnownBlock[],
      });
      log.info({ taskId }, 'Context thread reply posted');
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to post context thread reply (non-fatal)');
    }
  }

  if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
    try {
      const approvedNotifyText = `✅ Approved by <@${actorUserId}> — delivering now.`;
      const approveNotifyBlocks = notifyBlocks({
        state: 'Approved — delivering now',
        archetypeName: (archetype.role_name as string) ?? 'unknown',
        enrichment: notifyMsgRef.enrichment ?? null,
        emoji: '✅',
        extraText: `Approved by <@${actorUserId}>`,
      });
      await slackClient.updateMessage(
        notifyMsgRef.channel,
        notifyMsgRef.ts,
        approvedNotifyText,
        approveNotifyBlocks,
      );
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to update notify-received on approval (non-fatal)');
    }
  }

  const prismaForDelivery = new PrismaClient();
  const tenantEnvForDelivery = await loadTenantEnv(tenantId, {
    tenantRepo: new TenantRepository(prismaForDelivery),
    secretRepo: new TenantSecretRepository(prismaForDelivery),
  });
  await prismaForDelivery.$disconnect();

  const deliveryResult = await runDelivery({
    taskId,
    tenantId,
    supabaseUrl,
    supabaseKey,
    headers,
    archetype,
    approvalRequired: true,
    notifyMsgRef,
    tenantEnv: tenantEnvForDelivery,
    taskRawEvent,
    slackClient,
    approvalMsgTs,
    targetChannel,
  });

  if (deliveryResult.status === 'done' && approvalMsgTs && targetChannel) {
    const epoch = Math.floor(Date.now() / 1000);
    const isoFallback = new Date().toISOString();
    const sentText = `✅ Delivered <!date^${epoch}^{date_short_pretty} at {time}|${isoFallback}>`;
    log.info({ taskId }, 'State: Done');
    try {
      const doneBlocks = buildEnrichedTerminalBlocks({
        status: 'done',
        actorUserId,
        guestName: metadata['guest_name'] as string | undefined,
        propertyName: metadata['property_name'] as string | undefined,
        threadUid: metadata['thread_uid'] as string | undefined,
        leadUid: metadata['lead_uid'] as string | undefined,
        sentSnippet: (editedContent ?? (metadata['draft_response'] as string | undefined))?.slice(
          0,
          150,
        ),
        taskId,
      });
      await slackClient.updateMessage(
        targetChannel,
        approvalMsgTs,
        sentText,
        doneBlocks as KnownBlock[],
      );
    } catch (err) {
      log.warn(
        { taskId, approvalMsgTs, targetChannel, err },
        'Sent message update failed (non-fatal)',
      );
    }
    if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
      try {
        const terminalRecipientName = metadata['guest_name'] as string | undefined;
        const sentNotifyText = terminalRecipientName
          ? `Reply sent to ${terminalRecipientName}`
          : 'Reply sent';
        const notifyDoneBlocks = notifyBlocks({
          state: 'Done',
          archetypeName: (archetype.role_name as string) ?? 'unknown',
          enrichment: notifyMsgRef.enrichment ?? null,
          emoji: '✅',
          extraText: `Approved by <@${actorUserId}>`,
          sentSnippet: (editedContent ?? (metadata['draft_response'] as string | undefined))?.slice(
            0,
            150,
          ),
          threadHint: true,
        });
        await slackClient.updateMessage(
          notifyMsgRef.channel,
          notifyMsgRef.ts,
          sentNotifyText,
          notifyDoneBlocks as KnownBlock[],
        );
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to update notify-received after delivery (non-fatal)');
      }
    }
    await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
  }
}
