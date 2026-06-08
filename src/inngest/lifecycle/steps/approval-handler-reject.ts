import { createSlackClient } from '../../../lib/slack-client.js';
import { createLogger } from '../../../lib/logger.js';
import {
  buildTerminalBlocksWithContext,
  buildContextThreadBlocks,
} from '../../../lib/slack-blocks.js';
import { buildHostfullyLink } from '../../../lib/enrichment-adapters/hostfully.js';
import { clearPendingApprovalByTaskId } from '../../lib/pending-approvals.js';
import { patchTask, logStatusTransition } from '../../lib/lifecycle-helpers.js';
import { writeFeedbackEvent } from './lifecycle-helpers.js';
import type { KnownBlock } from '@slack/web-api';
import type { ApprovalHandlerContext } from './approval-handler.js';

const log = createLogger('lifecycle-approval-handler');

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
    await writeFeedbackEvent({
      supabaseUrl,
      supabaseKey,
      tenantId,
      archetypeId,
      taskId,
      eventType: 'rejection_reason',
      actorId: actorUserId,
      correctionContent: rejectionReason,
    });
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
      const rejThreadUid = metadata['thread_uid'] as string | undefined;
      const rejLeadUid = metadata['lead_uid'] as string | undefined;
      const rejectedBlocks = buildTerminalBlocksWithContext({
        status: 'rejected',
        actorUserId,
        recipientName: (metadata['recipient_name'] ?? metadata['guest_name']) as string | undefined,
        propertyName: metadata['property_name'] as string | undefined,
        contextUrl:
          rejThreadUid && rejLeadUid ? buildHostfullyLink(rejThreadUid, rejLeadUid) : undefined,
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
      const rejCtxThreadUid = metadata['thread_uid'] as string | undefined;
      const rejCtxLeadUid = metadata['lead_uid'] as string | undefined;
      const contextBlocks = buildContextThreadBlocks({
        action: 'reject',
        actorUserId,
        recipientName: (metadata['recipient_name'] ?? metadata['guest_name']) as string | undefined,
        propertyName: metadata['property_name'] as string | undefined,
        checkIn: metadata['check_in'] as string | undefined,
        checkOut: metadata['check_out'] as string | undefined,
        bookingChannel: metadata['booking_channel'] as string | undefined,
        originalMessage: metadata['original_message'] as string,
        draftResponse: metadata['draft_response'] as string | undefined,
        confidence: typeof metadata['confidence'] === 'number' ? metadata['confidence'] : undefined,
        category: metadata['category'] as string | undefined,
        contextUrl:
          rejCtxThreadUid && rejCtxLeadUid
            ? buildHostfullyLink(rejCtxThreadUid, rejCtxLeadUid)
            : undefined,
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
    await writeFeedbackEvent({
      supabaseUrl,
      supabaseKey,
      tenantId,
      archetypeId,
      taskId,
      eventType: 'rejection',
      actorId: actorUserId,
    });
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
