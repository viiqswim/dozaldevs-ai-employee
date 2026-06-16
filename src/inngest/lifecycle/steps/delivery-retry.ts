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
import { DELIVERY_PHASE_VALUE } from '../../../lib/output-contract-constants.js';
import { getPlatformSetting } from '../../../lib/platform-settings.js';
import { resolveWorkerSupabaseUrl } from '../lib/worker-url-resolver.js';
import { resolveDelivery } from '../../../lib/delivery-resolver.js';
import { missingDeliveryConfigFailureMessage } from '../../../lib/slack-copy.js';
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

  const deliveryResolution = resolveDelivery(
    {
      delivery_steps: (archetype.delivery_steps as string | null) ?? null,
      deliverable_type: (archetype.deliverable_type as string | null) ?? null,
    },
    undefined,
  );

  if (deliveryResolution.kind === 'misconfigured') {
    await patchTask(supabaseUrl, headers, taskId, {
      status: 'Failed',
      failure_reason: 'Employee produced output but has no delivery configuration.',
      failure_code: 'MISSING_DELIVERY_CONFIG',
    });
    const configFailText = missingDeliveryConfigFailureMessage();
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

  if (deliveryResolution.kind === 'no-delivery-escape-hatch') {
    await patchTask(supabaseUrl, headers, taskId, {
      status: 'Done',
      failure_reason: null,
      failure_code: null,
    });
    log.info({ taskId }, 'No delivery configured — completing without a delivery container');
    return { status: 'done' };
  }

  const defaultDeliveryVmSize = await getPlatformSetting('default_worker_vm_size');
  const issuesSlackChannel = await getPlatformSetting('issues_slack_channel');
  const workerEnvVars = (archetype.worker_env as Record<string, string> | null) ?? {};
  const deliveryVmSize = (archetype.vm_size as string | null) ?? defaultDeliveryVmSize;
  const deliveryImage = FLY_WORKER_IMAGE;
  const deliveryFlyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';
  const effectiveSupabaseUrlForDelivery = await resolveWorkerSupabaseUrl(supabaseUrl);

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
      const localDeliveryEnv: Record<string, string> = {
        ...tenantEnvForDelivery,
        ...workerEnvVars,
        TASK_ID: taskId,
        TENANT_ID: tenantId,
        TASK_TENANT_ID: tenantId,
        EMPLOYEE_PHASE: DELIVERY_PHASE_VALUE,
        EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown',
        APPROVAL_REQUIRED: String(approvalRequired),
        NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
        NOTIFY_MSG_CHANNEL: notifyMsgRef?.channel ?? '',
        ...(issuesSlackChannel ? { ISSUES_SLACK_CHANNEL: issuesSlackChannel } : {}),
        SUPABASE_URL: supabaseUrl.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal'),
        SUPABASE_SECRET_KEY: supabaseKey,
        INNGEST_BASE_URL: 'http://host.docker.internal:8288',
        GATEWAY_URL: 'http://host.docker.internal:7700',
        INNGEST_EVENT_KEY: INNGEST_EVENT_KEY,
        INNGEST_DEV: '1',
        ...(taskRawEvent['lead_uid'] ? { LEAD_UID: taskRawEvent['lead_uid'] } : {}),
        ...(taskRawEvent['thread_uid'] ? { THREAD_UID: taskRawEvent['thread_uid'] } : {}),
        ...(taskRawEvent['property_uid'] ? { PROPERTY_UID: taskRawEvent['property_uid'] } : {}),
      };
      const localDeliveryCriticalVars = [
        'TASK_ID',
        'TENANT_ID',
        'EMPLOYEE_ROLE_NAME',
        'APPROVAL_REQUIRED',
        'NOTIFY_MSG_TS',
        'NOTIFY_MSG_CHANNEL',
        'EMPLOYEE_PHASE',
        'LEAD_UID',
        'THREAD_UID',
        'PROPERTY_UID',
      ].filter((k) => localDeliveryEnv[k]);
      if (localDeliveryEnv['PLATFORM_ENV_MANIFEST']) {
        const existing = new Set(localDeliveryEnv['PLATFORM_ENV_MANIFEST'].split(','));
        const newKeys = localDeliveryCriticalVars.filter((k) => !existing.has(k));
        if (newKeys.length > 0) {
          localDeliveryEnv['PLATFORM_ENV_MANIFEST'] =
            `${localDeliveryEnv['PLATFORM_ENV_MANIFEST']},${newKeys.join(',')}`;
        }
      } else if (localDeliveryCriticalVars.length > 0) {
        localDeliveryEnv['PLATFORM_ENV_MANIFEST'] = localDeliveryCriticalVars.join(',');
      }
      deliveryMachine = runLocalDockerContainer({
        taskId,
        name: deliveryContainerName,
        env: localDeliveryEnv,
        cmd: ['node', '/app/dist/workers/opencode-harness.mjs'],
      });
    } else {
      const flyDeliveryEnv: Record<string, string> = {
        ...tenantEnvForDelivery,
        ...workerEnvVars,
        TASK_ID: taskId,
        TENANT_ID: tenantId,
        TASK_TENANT_ID: tenantId,
        EMPLOYEE_PHASE: DELIVERY_PHASE_VALUE,
        EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown',
        APPROVAL_REQUIRED: String(approvalRequired),
        NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
        NOTIFY_MSG_CHANNEL: notifyMsgRef?.channel ?? '',
        ...(issuesSlackChannel ? { ISSUES_SLACK_CHANNEL: issuesSlackChannel } : {}),
        SUPABASE_URL: effectiveSupabaseUrlForDelivery,
        SUPABASE_SECRET_KEY: supabaseKey,
        INNGEST_BASE_URL: INNGEST_BASE_URL,
        GATEWAY_URL: GATEWAY_URL,
        INNGEST_EVENT_KEY: INNGEST_EVENT_KEY,
        ...(taskRawEvent['lead_uid'] ? { LEAD_UID: taskRawEvent['lead_uid'] } : {}),
        ...(taskRawEvent['thread_uid'] ? { THREAD_UID: taskRawEvent['thread_uid'] } : {}),
        ...(taskRawEvent['property_uid'] ? { PROPERTY_UID: taskRawEvent['property_uid'] } : {}),
      };
      const flyDeliveryCriticalVars = [
        'TASK_ID',
        'TENANT_ID',
        'EMPLOYEE_ROLE_NAME',
        'APPROVAL_REQUIRED',
        'NOTIFY_MSG_TS',
        'NOTIFY_MSG_CHANNEL',
        'EMPLOYEE_PHASE',
        'INNGEST_BASE_URL',
        'INNGEST_EVENT_KEY',
        'LEAD_UID',
        'THREAD_UID',
        'PROPERTY_UID',
      ].filter((k) => flyDeliveryEnv[k]);
      if (flyDeliveryEnv['PLATFORM_ENV_MANIFEST']) {
        const existing = new Set(flyDeliveryEnv['PLATFORM_ENV_MANIFEST'].split(','));
        const newKeys = flyDeliveryCriticalVars.filter((k) => !existing.has(k));
        if (newKeys.length > 0) {
          flyDeliveryEnv['PLATFORM_ENV_MANIFEST'] =
            `${flyDeliveryEnv['PLATFORM_ENV_MANIFEST']},${newKeys.join(',')}`;
        }
      } else if (flyDeliveryCriticalVars.length > 0) {
        flyDeliveryEnv['PLATFORM_ENV_MANIFEST'] = flyDeliveryCriticalVars.join(',');
      }
      deliveryMachine = await createMachine(deliveryFlyApp, {
        image: deliveryImage,
        vm_size: deliveryVmSize,
        auto_destroy: true,
        kill_timeout: 1800,
        cmd: ['node', '/app/dist/workers/opencode-harness.mjs'],
        env: flyDeliveryEnv,
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
      log.debug(
        { taskId, attempt, poll: i, status: finalStatus },
        'Polling delivery for completion',
      );
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
