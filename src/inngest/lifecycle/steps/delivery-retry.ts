import { createMachine, destroyMachine } from '../../../lib/fly-client.js';
import { createLogger } from '../../../lib/logger.js';
import { createSlackClient } from '../../../lib/slack-client.js';
import { clearPendingApprovalByTaskId } from '../../lib/pending-approvals.js';
import { patchTask } from '../../lib/lifecycle-helpers.js';
import { runLocalDockerContainer, stopLocalDockerContainer } from '../../lib/lifecycle-helpers.js';
import {
  INNGEST_EVENT_KEY,
  INNGEST_BASE_URL,
  GATEWAY_URL,
  WORKER_RUNTIME,
  FLY_WORKER_IMAGE,
} from '../../../lib/config.js';
import { getTunnelUrl } from '../../../lib/tunnel-client.js';
import { getPlatformSetting } from '../../../lib/platform-settings.js';
import type { NotificationEnrichment } from '../../../lib/types/notification-enrichment.js';
import type { KnownBlock } from '@slack/web-api';

const log = createLogger('lifecycle-delivery-retry');

export interface DeliveryRetryContext {
  taskId: string;
  tenantId: string;
  supabaseUrl: string;
  supabaseKey: string;
  headers: Record<string, string>;
  archetype: Record<string, unknown>;
  approvalRequired: boolean;
  notifyMsgRef: { ts: string | null; channel: string | null; enrichment?: unknown } | null;
  tenantEnv: Record<string, string>;
  taskRawEvent: Record<string, string>;
  slackClient?: ReturnType<typeof createSlackClient>;
  approvalMsgTs?: string;
  targetChannel?: string;
}

export interface DeliveryRetryResult {
  status: 'done' | 'failed' | 'config-fail';
}

export async function runDeliveryWithRetry(
  ctx: DeliveryRetryContext,
): Promise<DeliveryRetryResult> {
  const {
    taskId,
    tenantId,
    supabaseUrl,
    supabaseKey,
    headers,
    archetype,
    approvalRequired,
    notifyMsgRef,
    tenantEnv: tenantEnvForDelivery,
    taskRawEvent,
    slackClient,
    approvalMsgTs,
    targetChannel,
  } = ctx;

  const archetypeForDeliveryRes = await fetch(
    `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=archetypes(delivery_instructions)`,
    { headers },
  );
  const archetypeRows = (await archetypeForDeliveryRes.json()) as Array<{
    archetypes?: { delivery_instructions?: string | null };
  }>;
  const deliveryInstructions = archetypeRows[0]?.archetypes?.delivery_instructions;
  if (!deliveryInstructions) {
    await patchTask(supabaseUrl, headers, taskId, {
      status: 'Failed',
      failure_reason: 'Archetype missing delivery_instructions',
    });
    const configFailText = `❌ Something went wrong — this employee isn't set up for delivery yet`;
    if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
      try {
        const botTokenForConfigFail = tenantEnvForDelivery['SLACK_BOT_TOKEN'] ?? '';
        if (botTokenForConfigFail) {
          const slackForConfigFail = createSlackClient({
            botToken: botTokenForConfigFail,
            defaultChannel: '',
          });
          await slackForConfigFail.updateMessage(
            notifyMsgRef.channel,
            notifyMsgRef.ts,
            configFailText,
            [
              { type: 'section', text: { type: 'mrkdwn', text: configFailText } },
              { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
            ] as KnownBlock[],
          );
        }
      } catch (err) {
        log.warn({ taskId, err }, 'Failed to update notify-received on config error (non-fatal)');
      }
    }
    return { status: 'config-fail' };
  }

  const defaultDeliveryVmSize = await getPlatformSetting('default_worker_vm_size');
  const deliveryVmSize = (archetype.vm_size as string | null) ?? defaultDeliveryVmSize;
  const deliveryImage = FLY_WORKER_IMAGE;
  const deliveryFlyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
  const effectiveSupabaseUrlForDelivery =
    WORKER_RUNTIME === 'fly' ? await getTunnelUrl() : supabaseUrl;

  let deliveryFinalStatus = '';
  const deliveryBaseName = `employee-delivery-${taskId.slice(0, 8)}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const deliveryContainerName =
      attempt === 0 ? deliveryBaseName : `${deliveryBaseName}-retry${attempt}`;
    if (attempt > 0 && WORKER_RUNTIME !== 'fly') {
      const prevName = attempt === 1 ? deliveryBaseName : `${deliveryBaseName}-retry${attempt - 1}`;
      stopLocalDockerContainer(prevName);
    }
    let deliveryMachine: { id: string };
    if (WORKER_RUNTIME !== 'fly') {
      deliveryMachine = runLocalDockerContainer({
        taskId,
        name: deliveryContainerName,
        env: {
          ...tenantEnvForDelivery,
          TASK_ID: taskId,
          EMPLOYEE_PHASE: 'delivery',
          EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown',
          APPROVAL_REQUIRED: String(approvalRequired),
          NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
          SUPABASE_URL: supabaseUrl.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal'),
          SUPABASE_SECRET_KEY: supabaseKey,
          INNGEST_BASE_URL: 'http://host.docker.internal:8288',
          GATEWAY_URL: 'http://host.docker.internal:7700',
          INNGEST_EVENT_KEY: INNGEST_EVENT_KEY,
          INNGEST_DEV: '1',
          ...(taskRawEvent['lead_uid'] ? { LEAD_UID: taskRawEvent['lead_uid'] } : {}),
          ...(taskRawEvent['thread_uid'] ? { THREAD_UID: taskRawEvent['thread_uid'] } : {}),
          ...(taskRawEvent['property_uid'] ? { PROPERTY_UID: taskRawEvent['property_uid'] } : {}),
        },
        cmd: ['node', '/app/dist/workers/opencode-harness.mjs'],
      });
    } else {
      deliveryMachine = await createMachine(deliveryFlyApp, {
        image: deliveryImage,
        vm_size: deliveryVmSize,
        auto_destroy: true,
        kill_timeout: 1800,
        cmd: ['node', '/app/dist/workers/opencode-harness.mjs'],
        env: {
          ...tenantEnvForDelivery,
          TASK_ID: taskId,
          EMPLOYEE_PHASE: 'delivery',
          EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown',
          APPROVAL_REQUIRED: String(approvalRequired),
          NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
          SUPABASE_URL: effectiveSupabaseUrlForDelivery,
          SUPABASE_SECRET_KEY: supabaseKey,
          INNGEST_BASE_URL: INNGEST_BASE_URL,
          GATEWAY_URL: GATEWAY_URL,
          INNGEST_EVENT_KEY: INNGEST_EVENT_KEY,
          ...(taskRawEvent['lead_uid'] ? { LEAD_UID: taskRawEvent['lead_uid'] } : {}),
          ...(taskRawEvent['thread_uid'] ? { THREAD_UID: taskRawEvent['thread_uid'] } : {}),
          ...(taskRawEvent['property_uid'] ? { PROPERTY_UID: taskRawEvent['property_uid'] } : {}),
        },
      });
    }
    log.info(
      { taskId, deliveryMachineId: deliveryMachine.id, attempt },
      'Delivery machine spawned',
    );

    const maxDeliveryPolls = 20;
    const deliveryIntervalMs = 15_000;
    let finalStatus = '';
    for (let i = 0; i < maxDeliveryPolls; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, deliveryIntervalMs));
      const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`, {
        headers,
      });
      const rows = (await res.json()) as Array<{ status: string }>;
      finalStatus = rows[0]?.status ?? '';
      if (finalStatus === 'Done' || finalStatus === 'Failed') break;
    }
    deliveryFinalStatus = finalStatus;

    if (WORKER_RUNTIME === 'fly') {
      try {
        await destroyMachine(deliveryFlyApp, deliveryMachine.id);
      } catch (err) {
        log.warn(
          { taskId, deliveryMachineId: deliveryMachine.id, err },
          'Failed to destroy delivery machine',
        );
      }
    } else {
      stopLocalDockerContainer(`employee-delivery-${taskId.slice(0, 8)}`);
    }

    if (deliveryFinalStatus === 'Done') break;

    if (attempt < 2) {
      log.warn({ taskId, attempt }, 'Delivery machine failed — retrying');
      await patchTask(supabaseUrl, headers, taskId, { status: 'Delivering' });
    } else {
      log.error({ taskId }, 'Delivery failed after 3 attempts — marking Failed');
      await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
      await patchTask(supabaseUrl, headers, taskId, {
        status: 'Failed',
        failure_reason: 'Delivery failed after 3 attempts',
      });
      if (approvalMsgTs && targetChannel && slackClient) {
        const errorText = `❌ Delivery ran into a problem after 3 attempts — I've marked this one as failed`;
        try {
          await slackClient.updateMessage(targetChannel, approvalMsgTs, errorText, [
            { type: 'section', text: { type: 'mrkdwn', text: errorText } },
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
          ] as KnownBlock[]);
        } catch (err) {
          log.warn(
            { taskId, approvalMsgTs, targetChannel, err },
            'Error message update failed (non-fatal)',
          );
        }
      }
      if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
        try {
          const botToken = tenantEnvForDelivery['SLACK_BOT_TOKEN'] ?? '';
          const slackForFail =
            slackClient ?? (botToken ? createSlackClient({ botToken, defaultChannel: '' }) : null);
          if (slackForFail) {
            const deliveryFailText = `❌ Something went wrong — the delivery did not go through`;
            const delivFailBlocks = [
              {
                type: 'section',
                text: { type: 'mrkdwn', text: deliveryFailText },
              },
              {
                type: 'context',
                elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
              },
            ] as KnownBlock[];
            await slackForFail.updateMessage(
              notifyMsgRef.channel,
              notifyMsgRef.ts,
              deliveryFailText,
              delivFailBlocks,
            );
          }
        } catch (err) {
          log.warn(
            { taskId, err },
            'Failed to update notify-received on delivery failure (non-fatal)',
          );
        }
      }
    }
  }

  return {
    status: deliveryFinalStatus === 'Done' ? 'done' : 'failed',
  };
}
