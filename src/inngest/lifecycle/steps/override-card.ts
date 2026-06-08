import type { GetStepTools, Inngest } from 'inngest';
import { createLogger } from '../../../lib/logger.js';
import { patchTask, logStatusTransition } from '../../lib/lifecycle-helpers.js';
import { parseClassifyResponse } from '../../../lib/classify-message.js';
import { buildNoActionThreadBlocks, buildOverrideCardBlocks } from '../../../lib/slack-blocks.js';
import { noActionSkippedMessage } from '../../../lib/slack-copy.js';
import type { NotifyRef } from './triage-and-ready.js';
import { loadTenantSlack } from './notify-and-track.js';
import type { TenantSlackContext } from './notify-and-track.js';
import { cleanupExecutionMachine, safeRecordWorkMetric } from './lifecycle-helpers.js';
import type { KnownBlock } from '@slack/web-api';

const log = createLogger('lifecycle-validate-and-submit');

type InngestStep = GetStepTools<Inngest>;

export interface OverrideCardContext {
  taskId: string;
  archetypeId: string;
  tenantId: string;
  supabaseUrl: string;
  headers: Record<string, string>;
  taskData: Record<string, unknown>;
  archetype: Record<string, unknown>;
  machineId: string;
  timeoutHours: number;
  notifyMsgRef: NotifyRef | null;
  notifyStateBlocks: (opts: { emoji: string; text: string }) => KnownBlock[];
  inngest: Inngest;
}

export async function runOverrideCardPath(
  ctx: OverrideCardContext,
  step: InngestStep,
): Promise<boolean> {
  const {
    taskId,
    archetypeId,
    tenantId,
    supabaseUrl,
    headers,
    taskData,
    archetype,
    machineId,
    timeoutHours,
    notifyMsgRef,
    notifyStateBlocks,
    inngest,
  } = ctx;

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

  if (!classificationCheck.skipApproval) {
    return false;
  }

  await step.run('cleanup-no-action', async () => {
    await cleanupExecutionMachine(machineId, taskId);
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
      await safeRecordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
    });
    return true;
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
      await safeRecordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
    });
    return true;
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
  return true;
}
