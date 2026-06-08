import type { InngestStep } from '../../events.js';
import { createLogger } from '../../../lib/logger.js';
import { createMachine, destroyMachine } from '../../../lib/fly-client.js';
import {
  patchTask,
  logStatusTransition,
  recordWorkMetric,
  runLocalDockerContainer,
  stopLocalDockerContainer,
} from '../../lib/lifecycle-helpers.js';
import { getTunnelUrl } from '../../../lib/tunnel-client.js';
import { getPlatformSetting } from '../../../lib/platform-settings.js';
import {
  INNGEST_EVENT_KEY,
  INNGEST_BASE_URL,
  GATEWAY_URL,
  WORKER_RUNTIME,
  FLY_WORKER_IMAGE,
} from '../../../lib/config.js';
import { query } from '../../../workers/lib/postgrest-client.js';
import type { TaskRow, EmployeeRuleRow } from '../../../workers/lib/postgrest-types.js';
import type { NotifyBlocksOpts, NotifyRef } from './triage-and-ready.js';
import type { KnownBlock } from '@slack/web-api';
import type { NotificationEnrichment } from '../../../lib/types/notification-enrichment.js';
import { loadTenantSlack } from './notify-and-track.js';

const log = createLogger('lifecycle-execute');

/** Maximum execution time for a Fly.io worker machine in seconds (30 minutes) */
const FLY_KILL_TIMEOUT_S = 1800;
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

    const defaultVmSize = await getPlatformSetting('default_worker_vm_size');
    const maxEmployeeRulesChars = parseInt(
      await getPlatformSetting('max_employee_rules_chars'),
      10,
    );
    const maxEmployeeKnowledgeChars = parseInt(
      await getPlatformSetting('max_employee_knowledge_chars'),
      10,
    );
    const issuesSlackChannel = await getPlatformSetting('issues_slack_channel');

    const vmSize = (archetype.vm_size as string | null) ?? defaultVmSize;
    const image = FLY_WORKER_IMAGE;
    const flyApp = process.env['FLY_WORKER_APP'] ?? 'ai-employee-workers';

    const effectiveSupabaseUrl =
      WORKER_RUNTIME === 'fly' && process.env.TUNNEL_URL ? await getTunnelUrl() : supabaseUrl;

    const slackCtxForExec = await loadTenantSlack(
      tenantId,
      (archetype.notification_channel as string | null) ?? null,
    );
    const tenantEnv = slackCtxForExec?.tenantEnv ?? {};

    const rawEvent = (taskData.raw_event as Record<string, string> | null) ?? {};
    const rawEventEnv: Record<string, string> = {};
    if (rawEvent.property_uid) rawEventEnv['PROPERTY_UID'] = rawEvent.property_uid;
    if (rawEvent.lead_uid) rawEventEnv['LEAD_UID'] = rawEvent.lead_uid;
    if (rawEvent.thread_uid) rawEventEnv['THREAD_UID'] = rawEvent.thread_uid;
    if (rawEvent.message_uid) rawEventEnv['MESSAGE_UID'] = rawEvent.message_uid;
    if (rawEvent.direction) rawEventEnv['OVERRIDE_DIRECTION'] = rawEvent.direction;

    const rawInputs = (rawEvent as unknown as Record<string, unknown>)['inputs'];
    if (rawInputs && typeof rawInputs === 'object') {
      for (const [key, value] of Object.entries(rawInputs as Record<string, string>)) {
        if (typeof value === 'string') {
          rawEventEnv[`INPUT_${key.toUpperCase()}`] = value;
        }
      }
    }

    const runtime = (archetype.runtime as string | null) ?? 'generic-harness';
    const cmd =
      runtime === 'opencode'
        ? ['node', '/app/dist/workers/opencode-harness.mjs']
        : ['node', '/app/dist/workers/generic-harness.mjs'];

    let employeeRules = '';
    try {
      const rulesRows =
        (await query<Pick<EmployeeRuleRow, 'rule_text' | 'confirmed_at'>>(
          'employee_rules',
          `status=eq.confirmed&archetype_id=eq.${archetypeId}&select=rule_text,confirmed_at&order=confirmed_at.desc`,
        )) ?? [];

      if (rulesRows.length > 0) {
        const header = '## Behavioral Rules — follow these';
        const lines: string[] = [];
        let charCount = header.length + 2;
        for (const rule of rulesRows) {
          const line = `- ${rule.rule_text}`;
          if (charCount + line.length + 1 > maxEmployeeRulesChars) break;
          lines.push(line);
          charCount += line.length + 1;
        }
        if (lines.length > 0) {
          employeeRules = `${header}\n\n${lines.join('\n')}`;
        }
      }
      log.info(
        { taskId, ruleCount: rulesRows.length, rulesLen: employeeRules.length },
        'Employee rules assembled',
      );
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to load employee rules — proceeding without them');
    }

    let employeeKnowledge = '';
    try {
      const kbRes = await fetch(
        `${supabaseUrl}/rest/v1/knowledge_bases?archetype_id=eq.${archetypeId}&select=source_config&order=created_at.desc`,
        { headers },
      );
      const kbRows = (await kbRes.json()) as Array<{ source_config: unknown }>;

      if (kbRows.length > 0) {
        const themes = kbRows.flatMap((kb) => {
          const cfg = kb.source_config as {
            themes?: Array<{
              theme: string;
              representative_quote: string;
              frequency: number;
            }>;
          } | null;
          return cfg?.themes ?? [];
        });

        if (themes.length > 0) {
          const header = '## Reference Knowledge';
          const lines: string[] = [];
          let charCount = header.length + 2;
          for (const t of themes) {
            const line = `- ${t.theme}: "${t.representative_quote}" (${t.frequency} occurrences)`;
            if (charCount + line.length + 1 > maxEmployeeKnowledgeChars) break;
            lines.push(line);
            charCount += line.length + 1;
          }
          if (lines.length > 0) {
            employeeKnowledge = `${header}\n\n${lines.join('\n')}`;
          }
        }
      }
      log.info(
        { taskId, kbCount: kbRows.length, knowledgeLen: employeeKnowledge.length },
        'Employee knowledge assembled',
      );
    } catch (err) {
      log.warn({ taskId, err }, 'Failed to load employee knowledge — proceeding without it');
    }

    log.info({ taskId, runtime }, 'Dispatching worker machine');

    const workerEnvVars = (archetype.worker_env as Record<string, string> | null) ?? {};

    if (WORKER_RUNTIME !== 'fly') {
      const localWorkerEnv: Record<string, string> = {
        ...tenantEnv,
        ...workerEnvVars,
        ...rawEventEnv,
        TASK_ID: taskId,
        TENANT_ID: tenantId,
        ...(issuesSlackChannel ? { ISSUES_SLACK_CHANNEL: issuesSlackChannel } : {}),
        SUPABASE_URL: supabaseUrl.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal'),
        SUPABASE_SECRET_KEY: supabaseKey,
        INNGEST_BASE_URL: 'http://host.docker.internal:8288',
        GATEWAY_URL: 'http://host.docker.internal:7700',
        INNGEST_EVENT_KEY: INNGEST_EVENT_KEY,
        INNGEST_DEV: '1',
        NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
        INNGEST_RUN_ID: runId,
        EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown',
        APPROVAL_REQUIRED: String(approvalRequired),
        ...(rawEvent['thread_uid'] ? { REPLY_BROADCAST: 'true' } : {}),
        ...(employeeRules ? { EMPLOYEE_RULES: employeeRules } : {}),
        ...(employeeKnowledge ? { EMPLOYEE_KNOWLEDGE: employeeKnowledge } : {}),
      };
      const localCriticalVars = [
        'TASK_ID',
        'TENANT_ID',
        'EMPLOYEE_ROLE_NAME',
        'APPROVAL_REQUIRED',
        'NOTIFY_MSG_TS',
        'INNGEST_RUN_ID',
        'REPLY_BROADCAST',
        'EMPLOYEE_RULES',
        'EMPLOYEE_KNOWLEDGE',
        ...Object.keys(rawEventEnv),
      ].filter((k) => localWorkerEnv[k]);
      if (localWorkerEnv['PLATFORM_ENV_MANIFEST']) {
        const existing = new Set(localWorkerEnv['PLATFORM_ENV_MANIFEST'].split(','));
        const newKeys = localCriticalVars.filter((k) => !existing.has(k));
        if (newKeys.length > 0) {
          localWorkerEnv['PLATFORM_ENV_MANIFEST'] =
            `${localWorkerEnv['PLATFORM_ENV_MANIFEST']},${newKeys.join(',')}`;
        }
      } else if (localCriticalVars.length > 0) {
        localWorkerEnv['PLATFORM_ENV_MANIFEST'] = localCriticalVars.join(',');
      }
      const localMachine = runLocalDockerContainer({
        taskId,
        name: `employee-${taskId.slice(0, 8)}`,
        env: localWorkerEnv,
        cmd: ['node', '/app/dist/workers/opencode-harness.mjs'],
      });
      return localMachine.id;
    }

    const flyWorkerEnv: Record<string, string> = {
      ...tenantEnv,
      ...workerEnvVars,
      ...rawEventEnv,
      TASK_ID: taskId,
      TENANT_ID: tenantId,
      ...(issuesSlackChannel ? { ISSUES_SLACK_CHANNEL: issuesSlackChannel } : {}),
      SUPABASE_URL: effectiveSupabaseUrl,
      SUPABASE_SECRET_KEY: supabaseKey,
      INNGEST_BASE_URL: INNGEST_BASE_URL,
      GATEWAY_URL: GATEWAY_URL,
      INNGEST_EVENT_KEY: INNGEST_EVENT_KEY,
      NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
      INNGEST_RUN_ID: runId,
      EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown',
      APPROVAL_REQUIRED: String(approvalRequired),
      ...(rawEvent['thread_uid'] ? { REPLY_BROADCAST: 'true' } : {}),
      ...(employeeRules ? { EMPLOYEE_RULES: employeeRules } : {}),
      ...(employeeKnowledge ? { EMPLOYEE_KNOWLEDGE: employeeKnowledge } : {}),
    };
    const flyCriticalVars = [
      'TASK_ID',
      'TENANT_ID',
      'EMPLOYEE_ROLE_NAME',
      'APPROVAL_REQUIRED',
      'NOTIFY_MSG_TS',
      'INNGEST_RUN_ID',
      'INNGEST_BASE_URL',
      'INNGEST_EVENT_KEY',
      'REPLY_BROADCAST',
      'EMPLOYEE_RULES',
      'EMPLOYEE_KNOWLEDGE',
      ...Object.keys(rawEventEnv),
    ].filter((k) => flyWorkerEnv[k]);
    if (flyWorkerEnv['PLATFORM_ENV_MANIFEST']) {
      const existing = new Set(flyWorkerEnv['PLATFORM_ENV_MANIFEST'].split(','));
      const newKeys = flyCriticalVars.filter((k) => !existing.has(k));
      if (newKeys.length > 0) {
        flyWorkerEnv['PLATFORM_ENV_MANIFEST'] =
          `${flyWorkerEnv['PLATFORM_ENV_MANIFEST']},${newKeys.join(',')}`;
      }
    } else if (flyCriticalVars.length > 0) {
      flyWorkerEnv['PLATFORM_ENV_MANIFEST'] = flyCriticalVars.join(',');
    }
    const machine = await createMachine(flyApp, {
      image,
      vm_size: vmSize,
      auto_destroy: true,
      kill_timeout: FLY_KILL_TIMEOUT_S,
      cmd,
      env: flyWorkerEnv,
    });
    return machine.id;
  });
  log.info({ taskId, runId, step: 'executing' }, 'Step complete: executing');

  const finalStatus = await step.run('poll-completion', async () => {
    const maxPolls = MAX_EXECUTION_POLLS;
    const intervalMs = POLL_INTERVAL_MS;

    for (let i = 0; i < maxPolls; i++) {
      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
      const rows = await query<Pick<TaskRow, 'status'>>('tasks', `id=eq.${taskId}&select=status`);
      const status = rows?.[0]?.status;
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
