import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Inngest, NonRetriableError } from 'inngest';
import type { InngestFunction } from 'inngest';
import { PrismaClient } from '@prisma/client';
import { createMachine, destroyMachine } from '../lib/fly-client.js';
import { createSlackClient } from '../lib/slack-client.js';
import { createLogger } from '../lib/logger.js';
import { getTunnelUrl } from '../lib/tunnel-client.js';
import { loadTenantEnv } from '../gateway/services/tenant-env-loader.js';
import { TenantRepository } from '../gateway/services/tenant-repository.js';
import { TenantSecretRepository } from '../gateway/services/tenant-secret-repository.js';
import { parseClassifyResponse } from '../lib/classify-message.js';
import { getAdapter } from '../lib/enrichment-adapters/index.js';
import type { NotificationEnrichment } from '../lib/types/notification-enrichment.js';
import {
  buildSupersededBlocks,
  buildNoActionThreadBlocks,
  buildOverrideCardBlocks,
  buildEnrichedTerminalBlocks,
  buildContextThreadBlocks,
  createTaskNotifyBuilders,
} from '../lib/slack-blocks.js';
import {
  clearPendingApprovalByTaskId,
  getPendingApproval,
  trackPendingApproval,
  clearPendingApproval,
} from './lib/pending-approvals.js';

const log = createLogger('employee-lifecycle');

export const SYNTHESIS_THRESHOLD = 5;
export const MAX_EMPLOYEE_RULES_CHARS = 8000;
const MAX_EMPLOYEE_KNOWLEDGE_CHARS = 32000;

async function patchTask(
  supabaseUrl: string,
  headers: Record<string, string>,
  taskId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`patchTask failed: HTTP ${res.status} — ${body}`);
  }
}

async function logStatusTransition(
  supabaseUrl: string,
  headers: Record<string, string>,
  taskId: string,
  toStatus: string,
  fromStatus?: string,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/rest/v1/task_status_log`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      task_id: taskId,
      from_status: fromStatus ?? null,
      to_status: toStatus,
      actor: 'lifecycle_fn',
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '(unreadable)');
    throw new Error(`logStatusTransition failed: HTTP ${res.status} — ${body}`);
  }
}

async function recordWorkMetric(
  supabaseUrl: string,
  headers: Record<string, string>,
  taskId: string,
  archetypeId: string | null,
  tenantId: string,
): Promise<void> {
  if (!archetypeId) return;
  const archetypeRes = await fetch(
    `${supabaseUrl}/rest/v1/archetypes?id=eq.${archetypeId}&select=estimated_manual_minutes,estimated_manual_minutes_override`,
    { headers },
  );
  if (!archetypeRes.ok) return;
  const archetypes = (await archetypeRes.json()) as Array<{
    estimated_manual_minutes: number | null;
    estimated_manual_minutes_override: number | null;
  }>;
  const archetype = archetypes[0];
  if (!archetype) return;
  const effectiveMinutes =
    archetype.estimated_manual_minutes_override ?? archetype.estimated_manual_minutes;
  if (effectiveMinutes == null) return;
  const metricsRes = await fetch(`${supabaseUrl}/rest/v1/task_metrics`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      task_id: taskId,
      archetype_id: archetypeId,
      tenant_id: tenantId,
      work_minutes: effectiveMinutes,
    }),
  });
  if (!metricsRes.ok) {
    const body = await metricsRes.text().catch(() => '(unreadable)');
    log.warn(
      { taskId, status: metricsRes.status, body },
      'Failed to write task_metrics row — non-fatal',
    );
  }
}

function runLocalDockerContainer(opts: {
  taskId: string;
  env: Record<string, string>;
  name: string;
  cmd?: string[];
}): { id: string } {
  stopLocalDockerContainer(opts.name);
  const cmd = opts.cmd ?? ['node', '/app/dist/workers/opencode-harness.mjs'];
  const envArgs = Object.entries(opts.env)
    .map(([k, v]) => `-e ${k}=${JSON.stringify(v)}`)
    .join(' ');
  const workerToolsPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../src/worker-tools',
  );
  let volumeFlag = '';
  if (existsSync(workerToolsPath)) {
    volumeFlag = `-v "${workerToolsPath}:/tools"`;
  } else {
    log.warn({ workerToolsPath }, 'worker-tools path not found — skipping bind mount');
  }
  const dockerCmd = `docker run -d --rm --add-host=host.docker.internal:host-gateway ${volumeFlag} --name ${JSON.stringify(opts.name)} ${envArgs} ai-employee-worker:latest ${cmd.join(' ')}`;
  const containerId = execSync(dockerCmd, { encoding: 'utf8' }).trim();
  const logFile = `/tmp/${opts.name}.log`;
  const logProc = spawn('sh', ['-c', `docker logs -f ${containerId} > ${logFile} 2>&1`], {
    detached: true,
    stdio: 'ignore',
  });
  logProc.unref();
  log.info(
    { taskId: opts.taskId, containerId, name: opts.name },
    'Local Docker container dispatched',
  );
  return { id: 'docker_' + containerId.slice(0, 12) };
}

function stopLocalDockerContainer(name: string): void {
  try {
    execSync(`docker stop ${JSON.stringify(name)} 2>/dev/null || true`, { encoding: 'utf8' });
    execSync(`docker rm -f ${JSON.stringify(name)} 2>/dev/null || true`, { encoding: 'utf8' });
  } catch {
    /* Container may not exist — safe to ignore */
  }
}

export function createEmployeeLifecycleFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'employee/universal-lifecycle',
      triggers: [{ event: 'employee/task.dispatched' }],
    },
    async ({ event, step, runId }) => {
      const { taskId, archetypeId } = event.data as { taskId: string; archetypeId: string };
      const { notifyBlocks, notifyStateBlocks } = createTaskNotifyBuilders({ taskId, runId });
      log.info({ taskId, runId, archetypeId }, 'Lifecycle started');

      const supabaseUrl = process.env.SUPABASE_URL!;
      const supabaseKey = process.env.SUPABASE_SECRET_KEY!;
      const headers: Record<string, string> = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };

      // ── State: Received ──────────────────────────────────────────────────────
      const taskData = await step.run('load-task', async () => {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=*,archetypes(*)`,
          { headers },
        );
        const rows = (await res.json()) as Array<Record<string, unknown>>;
        if (!rows.length) throw new NonRetriableError(`Task not found: ${taskId}`);
        return rows[0];
      });

      const archetype = (taskData.archetypes as Record<string, unknown>) ?? {};
      const riskModel = (archetype.risk_model as Record<string, unknown>) ?? {};
      const approvalRequired = riskModel.approval_required === true;
      log.info(
        {
          taskId,
          runId,
          step: 'load-task',
          archetypeId: archetype['id'] as string,
          roleName: archetype['role_name'] as string,
          approvalRequired,
        },
        'Step complete: load-task',
      );
      const timeoutHours = (riskModel.timeout_hours as number) ?? 24;
      const tenantId = taskData.tenant_id as string | undefined;
      if (!tenantId) {
        throw new Error('Task is missing tenant_id — cannot proceed with lifecycle');
      }

      // ── State: Triaging ──────────────────────────────────────────────────────
      // Auto-passes: no triage logic implemented yet — all tasks are unambiguous
      await step.run('triaging', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Triaging' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Triaging', 'Received');
        log.info({ taskId }, 'State: Triaging (auto-pass)');
      });
      log.info({ taskId, runId, step: 'triaging' }, 'Step complete: triaging');

      // ── Notification: Task received ──────────────────────────────────────────
      const notifyMsgRef = await step.run('notify-received', async () => {
        try {
          const prismaForNotify = new PrismaClient();
          const tenantEnvForNotify = await loadTenantEnv(
            tenantId,
            {
              tenantRepo: new TenantRepository(prismaForNotify),
              secretRepo: new TenantSecretRepository(prismaForNotify),
            },
            (archetype.notification_channel as string | null) ?? null,
          );
          await prismaForNotify.$disconnect();
          const botToken = tenantEnvForNotify['SLACK_BOT_TOKEN'] ?? '';
          const channel = tenantEnvForNotify['NOTIFICATION_CHANNEL'] ?? '';
          if (!botToken || !channel) return { ts: null, channel: null, enrichment: null };
          const roleName = (archetype.role_name as string) ?? 'unknown';
          const rawEventForSupersede = (taskData.raw_event as Record<string, unknown> | null) ?? {};
          const supersededNotifyTs = rawEventForSupersede['superseded_notify_ts'] as
            | string
            | undefined;
          const supersededNotifyChannel = rawEventForSupersede['superseded_notify_channel'] as
            | string
            | undefined;

          let enrichment: NotificationEnrichment | null = null;
          if (archetype.enrichment_adapter) {
            try {
              await import('../lib/enrichment-adapters/hostfully.js');
              const adapter = getAdapter(archetype.enrichment_adapter as string);
              if (adapter) {
                enrichment = await adapter(
                  (taskData.raw_event as Record<string, unknown>) ?? {},
                  tenantEnvForNotify as Record<string, string>,
                );
              }
            } catch (enrichErr) {
              log.warn({ taskId, enrichErr }, 'Enrichment adapter failed (non-fatal)');
            }
          }
          const blocks = notifyBlocks({
            state: 'Received',
            archetypeName: roleName,
            enrichment,
            emoji: '⏳',
          });
          if (supersededNotifyTs && supersededNotifyChannel) {
            try {
              const slackClientForSupersede = createSlackClient({
                botToken,
                defaultChannel: channel,
              });
              await slackClientForSupersede.updateMessage(
                supersededNotifyChannel,
                supersededNotifyTs,
                `⏳ Task received — processing (${roleName})`,
                blocks,
              );
              try {
                const currentMetadataForSupersede =
                  (
                    (await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=metadata`, {
                      headers,
                    }).then((r) => r.json())) as Array<{
                      metadata: Record<string, unknown> | null;
                    }>
                  )[0]?.metadata ?? {};
                await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
                  method: 'PATCH',
                  headers,
                  body: JSON.stringify({
                    metadata: {
                      ...currentMetadataForSupersede,
                      notify_slack_ts: supersededNotifyTs,
                      notify_slack_channel: supersededNotifyChannel,
                    },
                    updated_at: new Date().toISOString(),
                  }),
                });
              } catch (metaErr) {
                log.warn(
                  { taskId, metaErr },
                  'Failed to store superseded notify_slack_ts in task metadata (non-fatal)',
                );
              }
              return { ts: supersededNotifyTs, channel: supersededNotifyChannel, enrichment };
            } catch (err) {
              log.warn(
                { taskId, err },
                'chat.update failed for superseded thread — falling back to new top-level message',
              );
            }
          }
          const slackClientForNotify = createSlackClient({ botToken, defaultChannel: channel });
          const result = await slackClientForNotify.postMessage({
            channel,
            text: `⏳ Task received — processing (${roleName})`,
            blocks,
            unfurl_links: false,
          });
          if (result.ts) {
            try {
              const currentMetadata =
                (
                  (await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=metadata`, {
                    headers,
                  }).then((r) => r.json())) as Array<{ metadata: Record<string, unknown> | null }>
                )[0]?.metadata ?? {};
              const updatedMetadata = {
                ...currentMetadata,
                notify_slack_ts: result.ts,
                notify_slack_channel: channel,
                inngest_run_id: runId,
              };
              const metaPatchRes = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                  metadata: updatedMetadata,
                  updated_at: new Date().toISOString(),
                }),
              });
              if (!metaPatchRes.ok) {
                log.warn(
                  { taskId },
                  'Failed to store notify_slack_ts in task metadata (non-fatal)',
                );
              } else {
                log.info({ taskId }, 'notify_slack_ts stored in task metadata');
              }
            } catch (err) {
              log.warn(
                { taskId, err },
                'Error storing notify_slack_ts in task metadata (non-fatal)',
              );
            }
          }
          return { ts: result.ts, channel, enrichment };
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to send received notification (non-fatal)');
          return { ts: null, channel: null };
        }
      });
      log.info(
        { taskId, runId, step: 'notify-received', channel: notifyMsgRef?.channel },
        'Step complete: notify-received',
      );

      // ── State: AwaitingInput ─────────────────────────────────────────────────
      // Auto-passes: triage found no ambiguity
      await step.run('awaiting-input', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'AwaitingInput' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'AwaitingInput', 'Triaging');
        log.info({ taskId }, 'State: AwaitingInput (auto-pass)');
      });

      // ── State: Ready ─────────────────────────────────────────────────────────
      await step.run('ready', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Ready' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Ready', 'AwaitingInput');
        log.info({ taskId }, 'State: Ready');
      });

      // ── State: Executing ─────────────────────────────────────────────────────
      const machineId = await step.run('executing', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Executing' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Executing', 'Ready');
        log.info({ taskId }, 'State: Executing — provisioning machine');

        const vmSize =
          (archetype.vm_size as string | null) ??
          process.env['WORKER_VM_SIZE'] ??
          process.env['SUMMARIZER_VM_SIZE'] ??
          'shared-cpu-1x';
        const image = process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';
        const flyApp =
          process.env['FLY_WORKER_APP'] ??
          process.env['FLY_SUMMARIZER_APP'] ??
          'ai-employee-workers';

        const effectiveSupabaseUrl =
          process.env.WORKER_RUNTIME === 'fly' ? await getTunnelUrl() : supabaseUrl;

        const prismaClient = new PrismaClient();
        const tenantEnv = await loadTenantEnv(
          tenantId,
          {
            tenantRepo: new TenantRepository(prismaClient),
            secretRepo: new TenantSecretRepository(prismaClient),
          },
          (archetype.notification_channel as string | null) ?? null,
        );
        await prismaClient.$disconnect();

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
          const rulesRes = await fetch(
            `${supabaseUrl}/rest/v1/employee_rules?status=eq.confirmed&archetype_id=eq.${archetypeId}&select=rule_text,confirmed_at&order=confirmed_at.desc`,
            { headers },
          );
          const rulesRows = (await rulesRes.json()) as Array<{
            rule_text: string;
            confirmed_at: string;
          }>;

          if (rulesRows.length > 0) {
            const header = '## Behavioral Rules — follow these';
            const lines: string[] = [];
            let charCount = header.length + 2;
            for (const rule of rulesRows) {
              const line = `- ${rule.rule_text}`;
              if (charCount + line.length + 1 > MAX_EMPLOYEE_RULES_CHARS) break;
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
                if (charCount + line.length + 1 > MAX_EMPLOYEE_KNOWLEDGE_CHARS) break;
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

        if (process.env.WORKER_RUNTIME !== 'fly') {
          const localWorkerEnv: Record<string, string> = {
            ...tenantEnv,
            ...workerEnvVars,
            ...rawEventEnv,
            TASK_ID: taskId,
            TENANT_ID: tenantId,
            ISSUES_SLACK_CHANNEL: process.env['ISSUES_SLACK_CHANNEL'] ?? '',
            SUPABASE_URL: supabaseUrl.replace(/localhost|127\.0\.0\.1/, 'host.docker.internal'),
            SUPABASE_SECRET_KEY: supabaseKey,
            INNGEST_BASE_URL: 'http://host.docker.internal:8288',
            INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY ?? 'local',
            INNGEST_DEV: '1',
            NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
            INNGEST_RUN_ID: runId,
            EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown',
            APPROVAL_REQUIRED: String(approvalRequired),
            ...(rawEvent['thread_uid'] ? { REPLY_BROADCAST: 'true' } : {}),
            ...(employeeRules ? { EMPLOYEE_RULES: employeeRules } : {}),
            ...(employeeKnowledge ? { EMPLOYEE_KNOWLEDGE: employeeKnowledge } : {}),
          };
          // Always include platform-critical vars and rawEventEnv keys in the manifest so
          // OpenCode exposes them to the model via the bash tool env whitelist.
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
          ISSUES_SLACK_CHANNEL: process.env['ISSUES_SLACK_CHANNEL'] ?? '',
          SUPABASE_URL: effectiveSupabaseUrl,
          SUPABASE_SECRET_KEY: supabaseKey,
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
          kill_timeout: 1800,
          cmd,
          env: flyWorkerEnv,
        });

        return machine.id;
      });
      log.info({ taskId, runId, step: 'executing' }, 'Step complete: executing');

      // ── Poll for machine completion (Submitting or Failed) ───────────────────
      const finalStatus = await step.run('poll-completion', async () => {
        const maxPolls = 120;
        const intervalMs = 15_000;

        for (let i = 0; i < maxPolls; i++) {
          await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
          const res = await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`, {
            headers,
          });
          const rows = (await res.json()) as Array<{ status: string }>;
          const status = rows[0]?.status;
          if (status === 'Submitting' || status === 'Failed' || status === 'Cancelled')
            return status;
        }
        return 'Failed';
      });
      log.info({ taskId, runId, step: 'poll-completion' }, 'Step complete: poll-completion');

      if (finalStatus === 'Cancelled') {
        log.info({ taskId }, 'Task was cancelled (superseded) — stopping ghost worker');
        await step.run('mark-cancelled', async () => {
          if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
            try {
              const prismaForCancelled = new PrismaClient();
              const tenantEnvForCancelled = await loadTenantEnv(
                tenantId,
                {
                  tenantRepo: new TenantRepository(prismaForCancelled),
                  secretRepo: new TenantSecretRepository(prismaForCancelled),
                },
                (archetype.notification_channel as string | null) ?? null,
              );
              await prismaForCancelled.$disconnect();
              const botTokenForCancelled = tenantEnvForCancelled['SLACK_BOT_TOKEN'] ?? '';
              if (botTokenForCancelled) {
                const slackForCancelled = createSlackClient({
                  botToken: botTokenForCancelled,
                  defaultChannel: '',
                });
                const supersededText = `⏭️ Superseded`;
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
              log.warn(
                { taskId, err },
                'Failed to update notify-received on cancellation (non-fatal)',
              );
            }
          }
        });
        await step.run('cleanup-on-cancellation', async () => {
          try {
            if ((machineId as string).startsWith('docker_')) {
              stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
            } else {
              const flyApp =
                process.env['FLY_WORKER_APP'] ??
                process.env['FLY_SUMMARIZER_APP'] ??
                'ai-employee-workers';
              await destroyMachine(flyApp, machineId as string);
            }
          } catch (err) {
            log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
          }
        });
        return;
      }

      if (finalStatus === 'Failed') {
        log.error({ taskId }, 'Task failed in machine');
        await step.run('mark-failed', async () => {
          await patchTask(supabaseUrl, headers, taskId, { status: 'Failed' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Failed', 'Executing');
          if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
            try {
              const prismaForFail = new PrismaClient();
              const tenantEnvForFail = await loadTenantEnv(
                tenantId,
                {
                  tenantRepo: new TenantRepository(prismaForFail),
                  secretRepo: new TenantSecretRepository(prismaForFail),
                },
                (archetype.notification_channel as string | null) ?? null,
              );
              await prismaForFail.$disconnect();
              const botTokenForFail = tenantEnvForFail['SLACK_BOT_TOKEN'] ?? '';
              if (botTokenForFail) {
                const slackForFail = createSlackClient({
                  botToken: botTokenForFail,
                  defaultChannel: '',
                });
                const failText = `❌ Task failed`;
                const taskForFailReason = await fetch(
                  `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=failure_reason`,
                  { headers },
                );
                const taskForFailReasonData = taskForFailReason.ok
                  ? ((await taskForFailReason.json()) as Array<{ failure_reason: string | null }>)
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
        });
        await step.run('cleanup-on-failure', async () => {
          try {
            if ((machineId as string).startsWith('docker_')) {
              stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
            } else {
              const flyApp =
                process.env['FLY_WORKER_APP'] ??
                process.env['FLY_SUMMARIZER_APP'] ??
                'ai-employee-workers';
              await destroyMachine(flyApp, machineId as string);
            }
          } catch (err) {
            log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
          }
        });
        return;
      }

      // ── State: Validating ────────────────────────────────────────────────────
      // Auto-passes: no validation stages configured
      await step.run('validating', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Validating' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Validating', 'Submitting');
        log.info({ taskId }, 'State: Validating (auto-pass)');
      });
      log.info({ taskId, runId, step: 'validating' }, 'Step complete: validating');

      // ── State: Submitting ────────────────────────────────────────────────────
      await step.run('submitting', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Submitting' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Submitting', 'Validating');
        log.info({ taskId }, 'State: Submitting');
      });
      log.info({ taskId, runId, step: 'submitting' }, 'Step complete: submitting');

      if (!approvalRequired) {
        // ── STEP 1: Classification check ─────────────────────────────────────────
        const classificationCheckNoApproval = await step.run(
          'check-classification-no-approval',
          async () => {
            const supabaseUrlInner = process.env.SUPABASE_URL ?? '';
            for (let attempt = 1; attempt <= 3; attempt++) {
              const res = await fetch(
                `${supabaseUrlInner}/rest/v1/deliverables?external_ref=eq.${taskId}&select=content&order=created_at.desc&limit=1`,
                { headers },
              );
              const rows = (await res.json()) as Array<{ content: string }>;
              if (rows.length > 0) {
                const result = parseClassifyResponse(rows[0].content);
                return {
                  skipDelivery:
                    result.classification === 'NO_ACTION_NEEDED' &&
                    !archetype['delivery_instructions'],
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

        // ── STEP 2: NO_ACTION_NEEDED — skip delivery, go straight to Done ────────
        if (classificationCheckNoApproval.skipDelivery) {
          await step.run('cleanup-execution-machine-no-approval', async () => {
            try {
              if ((machineId as string).startsWith('docker_')) {
                stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
              } else {
                const flyApp =
                  process.env['FLY_WORKER_APP'] ??
                  process.env['FLY_SUMMARIZER_APP'] ??
                  'ai-employee-workers';
                await destroyMachine(flyApp, machineId as string);
              }
            } catch (err) {
              log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
            }
          });

          await step.run('post-no-action-thread-no-approval', async () => {
            if (!notifyMsgRef?.ts) return;
            try {
              const prismaForNoAction = new PrismaClient();
              const tenantEnvForNoAction = await loadTenantEnv(
                tenantId,
                {
                  tenantRepo: new TenantRepository(prismaForNoAction),
                  secretRepo: new TenantSecretRepository(prismaForNoAction),
                },
                (archetype.notification_channel as string | null) ?? null,
              );
              await prismaForNoAction.$disconnect();
              const botTokenForNoAction = tenantEnvForNoAction['SLACK_BOT_TOKEN'] ?? '';
              const channelForNoAction = tenantEnvForNoAction['NOTIFICATION_CHANNEL'] ?? '';
              if (!botTokenForNoAction || !channelForNoAction) return;
              const slackForNoAction = createSlackClient({
                botToken: botTokenForNoAction,
                defaultChannel: channelForNoAction,
              });
              const rawEventForNoAction =
                (taskData.raw_event as Record<string, string> | null) ?? {};
              await slackForNoAction.postMessage({
                channel: channelForNoAction,
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
                const prismaForNoActionDone = new PrismaClient();
                const tenantEnvForNoActionDone = await loadTenantEnv(
                  tenantId,
                  {
                    tenantRepo: new TenantRepository(prismaForNoActionDone),
                    secretRepo: new TenantSecretRepository(prismaForNoActionDone),
                  },
                  (archetype.notification_channel as string | null) ?? null,
                );
                await prismaForNoActionDone.$disconnect();
                const botTokenForNoActionDone = tenantEnvForNoActionDone['SLACK_BOT_TOKEN'] ?? '';
                if (botTokenForNoActionDone) {
                  const slackForNoActionDone = createSlackClient({
                    botToken: botTokenForNoActionDone,
                    defaultChannel: '',
                  });
                  await slackForNoActionDone.updateMessage(
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

        // ── STEP 3: deliverable_type guard ────────────────────────────────────────
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
                const prismaForNoDel = new PrismaClient();
                const tenantEnvForNoDel = await loadTenantEnv(
                  tenantId,
                  {
                    tenantRepo: new TenantRepository(prismaForNoDel),
                    secretRepo: new TenantSecretRepository(prismaForNoDel),
                  },
                  (archetype.notification_channel as string | null) ?? null,
                );
                await prismaForNoDel.$disconnect();
                const botTokenForNoDel = tenantEnvForNoDel['SLACK_BOT_TOKEN'] ?? '';
                if (botTokenForNoDel) {
                  const slackForNoDel = createSlackClient({
                    botToken: botTokenForNoDel,
                    defaultChannel: '',
                  });
                  await slackForNoDel.updateMessage(
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
              if ((machineId as string).startsWith('docker_')) {
                stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
              } else {
                const flyApp =
                  process.env['FLY_WORKER_APP'] ??
                  process.env['FLY_SUMMARIZER_APP'] ??
                  'ai-employee-workers';
                await destroyMachine(flyApp, machineId as string);
              }
            } catch (err) {
              log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
            }
          });
          return;
        }

        // ── STEP 4: Destroy execution machine BEFORE spawning delivery ─────────────
        await step.run('cleanup-execution-machine-before-delivery', async () => {
          try {
            if ((machineId as string).startsWith('docker_')) {
              stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
            } else {
              const flyApp =
                process.env['FLY_WORKER_APP'] ??
                process.env['FLY_SUMMARIZER_APP'] ??
                'ai-employee-workers';
              await destroyMachine(flyApp, machineId as string);
            }
          } catch (err) {
            log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
          }
        });

        // ── STEP 5: Transition to Delivering state ────────────────────────────────
        await step.run('delivering-no-approval', async () => {
          await patchTask(supabaseUrl, headers, taskId, { status: 'Delivering' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Delivering', 'Submitting');
          log.info({ taskId }, 'State: Delivering (no approval required)');
        });

        // ── STEPS 6–8: Load tenant env, fetch delivery_instructions, spawn container ─
        const noApprovalDeliveryResult = await step.run('run-delivery-no-approval', async () => {
          const prismaForDelivery = new PrismaClient();
          const tenantEnvForDelivery = await loadTenantEnv(
            tenantId,
            {
              tenantRepo: new TenantRepository(prismaForDelivery),
              secretRepo: new TenantSecretRepository(prismaForDelivery),
            },
            (archetype.notification_channel as string | null) ?? null,
          );
          await prismaForDelivery.$disconnect();

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
            const configFailText = `❌ Task failed — missing delivery configuration`;
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
                    notifyStateBlocks({
                      emoji: '❌',
                      text: 'Task failed — missing delivery configuration',
                    }),
                  );
                }
              } catch (err) {
                log.warn(
                  { taskId, err },
                  'Failed to update notify-received on config error (non-fatal)',
                );
              }
            }
            return { status: 'config-fail' as const };
          }

          const deliveryVmSize =
            (archetype.vm_size as string | null) ??
            process.env['WORKER_VM_SIZE'] ??
            process.env['SUMMARIZER_VM_SIZE'] ??
            'shared-cpu-1x';
          const deliveryImage =
            process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';
          const deliveryFlyApp =
            process.env['FLY_WORKER_APP'] ??
            process.env['FLY_SUMMARIZER_APP'] ??
            'ai-employee-workers';
          const effectiveSupabaseUrlForDelivery =
            process.env.WORKER_RUNTIME === 'fly' ? await getTunnelUrl() : supabaseUrl;

          const taskRawEventForDelivery =
            (taskData.raw_event as Record<string, string> | null) ?? {};

          let deliveryFinalStatus = '';
          const deliveryBaseName = `employee-delivery-${taskId.slice(0, 8)}`;
          for (let attempt = 0; attempt < 3; attempt++) {
            const deliveryContainerName =
              attempt === 0 ? deliveryBaseName : `${deliveryBaseName}-retry${attempt}`;
            if (attempt > 0 && process.env.WORKER_RUNTIME !== 'fly') {
              const prevName =
                attempt === 1 ? deliveryBaseName : `${deliveryBaseName}-retry${attempt - 1}`;
              stopLocalDockerContainer(prevName);
            }
            let deliveryMachine: { id: string };
            if (process.env.WORKER_RUNTIME !== 'fly') {
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
                  SUPABASE_URL: supabaseUrl.replace(
                    /localhost|127\.0\.0\.1/,
                    'host.docker.internal',
                  ),
                  SUPABASE_SECRET_KEY: supabaseKey,
                  INNGEST_BASE_URL: 'http://host.docker.internal:8288',
                  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY ?? 'local',
                  INNGEST_DEV: '1',
                  ...(taskRawEventForDelivery['lead_uid']
                    ? { LEAD_UID: taskRawEventForDelivery['lead_uid'] }
                    : {}),
                  ...(taskRawEventForDelivery['thread_uid']
                    ? { THREAD_UID: taskRawEventForDelivery['thread_uid'] }
                    : {}),
                  ...(taskRawEventForDelivery['property_uid']
                    ? { PROPERTY_UID: taskRawEventForDelivery['property_uid'] }
                    : {}),
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
                  ...(taskRawEventForDelivery['lead_uid']
                    ? { LEAD_UID: taskRawEventForDelivery['lead_uid'] }
                    : {}),
                  ...(taskRawEventForDelivery['thread_uid']
                    ? { THREAD_UID: taskRawEventForDelivery['thread_uid'] }
                    : {}),
                  ...(taskRawEventForDelivery['property_uid']
                    ? { PROPERTY_UID: taskRawEventForDelivery['property_uid'] }
                    : {}),
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
              const res = await fetch(
                `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`,
                { headers },
              );
              const rows = (await res.json()) as Array<{ status: string }>;
              finalStatus = rows[0]?.status ?? '';
              if (finalStatus === 'Done' || finalStatus === 'Failed') break;
            }
            deliveryFinalStatus = finalStatus;

            if (process.env.WORKER_RUNTIME === 'fly') {
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
              if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
                try {
                  const botTokenForFail = tenantEnvForDelivery['SLACK_BOT_TOKEN'] ?? '';
                  if (botTokenForFail) {
                    const slackForFail = createSlackClient({
                      botToken: botTokenForFail,
                      defaultChannel: '',
                    });
                    const deliveryFailText = `❌ Task failed — delivery unsuccessful`;
                    const delivFailBlocks = notifyBlocks({
                      state: 'Delivery failed',
                      archetypeName: (archetype.role_name as string) ?? 'unknown',
                      enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
                      emoji: '❌',
                    });
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
            status: deliveryFinalStatus === 'Done' ? ('done' as const) : ('failed' as const),
          };
        });

        // ── STEP 9: On delivery success, update notify message ────────────────────
        if (noApprovalDeliveryResult.status === 'done') {
          await step.run('complete-after-delivery-no-approval', async () => {
            log.info({ taskId }, 'State: Done (delivered — no approval required)');
            if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
              try {
                const prismaForComplete = new PrismaClient();
                const tenantEnvForComplete = await loadTenantEnv(
                  tenantId,
                  {
                    tenantRepo: new TenantRepository(prismaForComplete),
                    secretRepo: new TenantSecretRepository(prismaForComplete),
                  },
                  (archetype.notification_channel as string | null) ?? null,
                );
                await prismaForComplete.$disconnect();
                const botTokenForComplete = tenantEnvForComplete['SLACK_BOT_TOKEN'] ?? '';
                if (botTokenForComplete) {
                  const slackForComplete = createSlackClient({
                    botToken: botTokenForComplete,
                    defaultChannel: '',
                  });
                  await slackForComplete.updateMessage(
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
            // ── STEP 10: Best-effort cleanup of stale approval cards ─────────────
            // Race condition guard: remove any approval card buttons the worker may have
            // posted before the lifecycle could suppress them (APPROVAL_REQUIRED env var)
            try {
              const approvalCleanupRes = await fetch(
                `${supabaseUrl}/rest/v1/pending_approvals?task_id=eq.${taskId}&limit=1`,
                {
                  headers: {
                    apikey: supabaseKey,
                    Authorization: `Bearer ${supabaseKey}`,
                  },
                },
              );
              const approvalCleanupRows = (await approvalCleanupRes.json()) as Array<
                Record<string, unknown>
              >;
              const approvalCardRow = approvalCleanupRows[0];
              if (approvalCardRow?.['slack_ts'] && approvalCardRow?.['channel_id']) {
                const prismaForCleanup = new PrismaClient();
                const tenantEnvForCleanup = await loadTenantEnv(
                  tenantId,
                  {
                    tenantRepo: new TenantRepository(prismaForCleanup),
                    secretRepo: new TenantSecretRepository(prismaForCleanup),
                  },
                  (archetype.notification_channel as string | null) ?? null,
                );
                await prismaForCleanup.$disconnect();
                const botTokenForCleanup = tenantEnvForCleanup['SLACK_BOT_TOKEN'] ?? '';
                if (botTokenForCleanup) {
                  const slackForCleanup = createSlackClient({
                    botToken: botTokenForCleanup,
                    defaultChannel: '',
                  });
                  await slackForCleanup.updateMessage(
                    approvalCardRow['channel_id'] as string,
                    approvalCardRow['slack_ts'] as string,
                    '✅ Completed — no approval required',
                    [
                      {
                        type: 'section',
                        text: { type: 'mrkdwn', text: '✅ Completed — no approval required' },
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

        // ── STEP 11: Record work metric ───────────────────────────────────────────
        await step.run('record-work-metric-after-delivery', async () => {
          try {
            await recordWorkMetric(supabaseUrl, headers, taskId, archetypeId, tenantId);
          } catch (err) {
            log.warn({ err, taskId }, 'Failed to record work metric — non-fatal');
          }
        });
        return;
      }

      // ── Classification check: auto-complete NO_ACTION_NEEDED ─────────────────
      const classificationCheck = await step.run('check-classification', async () => {
        const supabaseUrlInner = process.env.SUPABASE_URL ?? '';

        // Retry up to 3 times with 1s delay — deliverable may not be committed yet
        for (let attempt = 1; attempt <= 3; attempt++) {
          const res = await fetch(
            `${supabaseUrlInner}/rest/v1/deliverables?external_ref=eq.${taskId}&select=content&order=created_at.desc&limit=1`,
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
        // No deliverable found after retries — proceed to Reviewing (safe default)
        return { skipApproval: false, reasoning: '', displayContext: undefined };
      });

      if (classificationCheck.skipApproval) {
        await step.run('cleanup-no-action', async () => {
          try {
            if ((machineId as string).startsWith('docker_')) {
              stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
            } else {
              const flyApp =
                process.env['FLY_WORKER_APP'] ??
                process.env['FLY_SUMMARIZER_APP'] ??
                'ai-employee-workers';
              await destroyMachine(flyApp, machineId as string);
            }
          } catch (err) {
            log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
          }
        });

        const overrideCardRef = await step.run('post-override-card', async () => {
          try {
            const prismaForCard = new PrismaClient();
            const tenantEnvForCard = await loadTenantEnv(
              tenantId,
              {
                tenantRepo: new TenantRepository(prismaForCard),
                secretRepo: new TenantSecretRepository(prismaForCard),
              },
              (archetype.notification_channel as string | null) ?? null,
            );
            await prismaForCard.$disconnect();
            const botTokenForCard = tenantEnvForCard['SLACK_BOT_TOKEN'] ?? '';
            const channelForCard = tenantEnvForCard['NOTIFICATION_CHANNEL'] ?? '';
            if (!botTokenForCard || !channelForCard) return { ts: null, channel: null };

            const slackForCard = createSlackClient({
              botToken: botTokenForCard,
              defaultChannel: channelForCard,
            });

            const reasoning = classificationCheck.reasoning ?? '';
            const displayContext = classificationCheck.displayContext ?? {};
            const roleName = (archetype.role_name as string) ?? 'unknown';
            const rawEventForCard = (taskData.raw_event as Record<string, string> | null) ?? {};

            if (notifyMsgRef?.ts) {
              await slackForCard.postMessage({
                channel: channelForCard,
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

            const result = await slackForCard.postMessage({
              channel: channelForCard,
              text: `🤖 No action needed — AI skipped this task`,
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
                    override_card_channel: channelForCard,
                  },
                }),
              },
            );

            return { ts: result.ts, channel: channelForCard };
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

        const updateOverrideCard = async (
          text: string,
          slackClient: ReturnType<typeof createSlackClient>,
        ) => {
          if (overrideCardRef?.ts && overrideCardRef?.channel) {
            try {
              await slackClient.updateMessage(overrideCardRef.channel, overrideCardRef.ts, text, [
                { type: 'section', text: { type: 'mrkdwn', text } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
              ]);
            } catch (err) {
              log.warn({ taskId, err }, 'Failed to update override card (non-fatal)');
            }
          }
        };

        const updateNotifyMsg = async (
          text: string,
          slackClient: ReturnType<typeof createSlackClient>,
          blocks?: unknown[],
        ) => {
          if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
            try {
              await slackClient.updateMessage(
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
              const prismaForTimeout = new PrismaClient();
              const tenantEnvForTimeout = await loadTenantEnv(
                tenantId,
                {
                  tenantRepo: new TenantRepository(prismaForTimeout),
                  secretRepo: new TenantSecretRepository(prismaForTimeout),
                },
                (archetype.notification_channel as string | null) ?? null,
              );
              await prismaForTimeout.$disconnect();
              const botTokenForTimeout = tenantEnvForTimeout['SLACK_BOT_TOKEN'] ?? '';
              if (botTokenForTimeout) {
                const slackForTimeout = createSlackClient({
                  botToken: botTokenForTimeout,
                  defaultChannel: '',
                });
                await updateNotifyMsg(
                  resolvedText,
                  slackForTimeout,
                  notifyStateBlocks({ emoji: '✅', text: 'No action needed' }),
                );
                await updateOverrideCard(resolvedText, slackForTimeout);
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
              const prismaForDismiss = new PrismaClient();
              const tenantEnvForDismiss = await loadTenantEnv(
                tenantId,
                {
                  tenantRepo: new TenantRepository(prismaForDismiss),
                  secretRepo: new TenantSecretRepository(prismaForDismiss),
                },
                (archetype.notification_channel as string | null) ?? null,
              );
              await prismaForDismiss.$disconnect();
              const botTokenForDismiss = tenantEnvForDismiss['SLACK_BOT_TOKEN'] ?? '';
              if (botTokenForDismiss) {
                const slackForDismiss = createSlackClient({
                  botToken: botTokenForDismiss,
                  defaultChannel: '',
                });
                await updateNotifyMsg(
                  resolvedText,
                  slackForDismiss,
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

      // ── Supersede Detection ──────────────────────────────────────────────────
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

        if (!conversationRef && !authoritativeThreadUid) {
          return;
        }

        const lookupKey = authoritativeThreadUid ?? conversationRef!;

        const pending = await getPendingApproval(supabaseUrl, supabaseKey, tenantId, lookupKey);

        // Determine the old task to supersede — prefer pending_approvals record, but fall back
        // to a direct task lookup if the record is missing (e.g. track-pending-approval raced
        // with check-supersede, or the record was never written due to a transient error).
        let oldTaskId: string | null = null;
        let oldApprovalMsgTs: string | null = null;
        let oldApprovalChannel: string | null = null;

        if (pending && pending.taskId !== taskId) {
          // Happy path: pending_approvals record exists
          const oldTaskRes = await fetch(
            `${supabaseUrl}/rest/v1/tasks?id=eq.${pending.taskId}&select=status`,
            { headers },
          );
          const oldTaskRows = (await oldTaskRes.json()) as Array<{ status: string }>;
          const oldTaskStatus = oldTaskRows[0]?.status;

          if (!['Reviewing', 'Cancelled'].includes(oldTaskStatus)) {
            // PM already acted (approved/rejected) — pending_approvals already cleared by handler,
            // this is a stale row. Clear it and skip.
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
          // Fallback: no pending_approvals record — query tasks directly for a Reviewing/Cancelled
          // task on the same conversation thread that isn't the current task.
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

          if (!oldTaskId) {
            // No supersedable task found via fallback — nothing to do
            return;
          }

          // Look up the old task's approval card ts from its deliverable
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

        // Old task is Reviewing or Cancelled (system-superseded by webhook handler) — supersede it
        log.info(
          { taskId, oldTaskId, conversationRef },
          'Superseding old task for same conversation',
        );

        // Update old Slack card to show superseded state
        if (oldApprovalMsgTs && oldApprovalChannel) {
          try {
            const prismaForSupersede = new PrismaClient();
            const tenantEnvForSupersede = await loadTenantEnv(tenantId, {
              tenantRepo: new TenantRepository(prismaForSupersede),
              secretRepo: new TenantSecretRepository(prismaForSupersede),
            });
            await prismaForSupersede.$disconnect();
            const botToken = tenantEnvForSupersede.SLACK_BOT_TOKEN ?? '';
            const slackClientForSupersede = createSlackClient({ botToken, defaultChannel: '' });
            await slackClientForSupersede.updateMessage(
              oldApprovalChannel,
              oldApprovalMsgTs,
              '⏭️ Superseded',
              buildSupersededBlocks(oldTaskId),
            );
          } catch (err) {
            log.warn(
              { taskId, oldTaskId, err },
              'Failed to update superseded Slack card (non-fatal)',
            );
          }
        }

        // Delete nudge broadcast for superseded task (non-fatal)
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
            const prismaForNudgeDel = new PrismaClient();
            const tenantEnvForNudgeDel = await loadTenantEnv(tenantId, {
              tenantRepo: new TenantRepository(prismaForNudgeDel),
              secretRepo: new TenantSecretRepository(prismaForNudgeDel),
            });
            await prismaForNudgeDel.$disconnect();
            const nudgeDelBotToken = tenantEnvForNudgeDel.SLACK_BOT_TOKEN ?? '';
            const { WebClient } = await import('@slack/web-api');
            const web = new WebClient(nudgeDelBotToken);
            await web.chat.delete({ channel: supersededNudgeChannel, ts: supersededNudgeTs });
            log.info({ taskId, supersededNudgeTs }, 'Superseded nudge broadcast deleted');
          }
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to delete superseded nudge broadcast (non-fatal)');
        }

        // Fire superseded event to unblock old lifecycle's waitForEvent
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

      // ── State: Reviewing ─────────────────────────────────────────────────────
      await step.run('set-reviewing', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Reviewing' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Reviewing', 'Submitting');
        log.info({ taskId }, 'State: Reviewing — awaiting human approval');
      });

      await step.run('update-notify-reviewing', async () => {
        if (!notifyMsgRef?.ts || !notifyMsgRef?.channel) return;
        try {
          const prismaForReviewing = new PrismaClient();
          const tenantEnvForReviewing = await loadTenantEnv(
            tenantId,
            {
              tenantRepo: new TenantRepository(prismaForReviewing),
              secretRepo: new TenantSecretRepository(prismaForReviewing),
            },
            (archetype.notification_channel as string | null) ?? null,
          );
          await prismaForReviewing.$disconnect();
          const botTokenForReviewing = tenantEnvForReviewing['SLACK_BOT_TOKEN'] ?? '';
          if (!botTokenForReviewing) return;
          const slackForReviewing = createSlackClient({
            botToken: botTokenForReviewing,
            defaultChannel: '',
          });
          const reviewingDelivRes = await fetch(
            `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=metadata&order=created_at.desc&limit=1`,
            { headers },
          );
          const reviewingDelivRows = (await reviewingDelivRes.json()) as Array<{
            metadata: Record<string, unknown> | null;
          }>;
          const reviewingGuestName = reviewingDelivRows[0]?.metadata?.['guest_name'] as
            | string
            | undefined;
          const reviewingText = reviewingGuestName
            ? `Awaiting approval — reply drafted for ${reviewingGuestName}`
            : 'Awaiting approval — reply drafted';
          const reviewingBlocks = notifyBlocks({
            state: 'Reviewing',
            archetypeName: (archetype.role_name as string) ?? 'unknown',
            enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
            emoji: '⏳',
          });
          await slackForReviewing.updateMessage(
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

        // For guest-messaging employees, use the Hostfully thread_uid for supersede detection.
        // For all other employees, fall back to taskId as a stable unique identifier.
        const threadUid = threadUidForTracking ?? taskId;

        await trackPendingApproval(supabaseUrl, supabaseKey, {
          tenantId,
          threadUid,
          taskId,
          slackTs: approvalMsgTs,
          channelId: targetChannel,
          recipientName: delivMeta.guest_name as string | undefined,
          contextLabel: delivMeta.property_name as string | undefined,
          urgency: delivMeta.urgency as boolean | undefined,
        });
        log.info({ taskId, threadUid }, 'Pending approval tracked');

        if (archetype.enrichment_adapter && notifyMsgRef?.ts && notifyMsgRef?.channel) {
          try {
            const prismaForNudge = new PrismaClient();
            const tenantEnvForNudge = await loadTenantEnv(
              tenantId,
              {
                tenantRepo: new TenantRepository(prismaForNudge),
                secretRepo: new TenantSecretRepository(prismaForNudge),
              },
              (archetype.notification_channel as string | null) ?? null,
            );
            await prismaForNudge.$disconnect();
            const botTokenForNudge = tenantEnvForNudge['SLACK_BOT_TOKEN'] ?? '';
            if (botTokenForNudge) {
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

              const nudgeGuestName = delivMeta.guest_name as string | undefined;
              const nudgePropertyName = delivMeta.property_name as string | undefined;
              const nudgeText = nudgeGuestName
                ? `⏳ ${nudgeGuestName}${nudgePropertyName ? ` · ${nudgePropertyName}` : ''} — Needs your review`
                : '⏳ Needs your review';

              const { WebClient } = await import('@slack/web-api');
              const web = new WebClient(botTokenForNudge);
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

      // ── State: Approved or Cancelled ─────────────────────────────────────────
      await step.run('handle-approval-result', async () => {
        const prismaForApproval = new PrismaClient();
        const tenantEnvForApproval = await loadTenantEnv(tenantId, {
          tenantRepo: new TenantRepository(prismaForApproval),
          secretRepo: new TenantSecretRepository(prismaForApproval),
        });
        await prismaForApproval.$disconnect();

        const botToken = tenantEnvForApproval.SLACK_BOT_TOKEN ?? '';

        const slackClient = createSlackClient({
          botToken,
          defaultChannel: '',
        });

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
        const approvalMsgTs = metadata.approval_message_ts as string | undefined;
        const targetChannel =
          (metadata.target_channel as string) ??
          tenantEnvForApproval['NOTIFICATION_CHANNEL'] ??
          tenantEnvForApproval['SUMMARY_TARGET_CHANNEL'] ??
          '';
        // Delete nudge broadcast if it exists (non-fatal)
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
        if (!approvalEvent) {
          if (approvalMsgTs && targetChannel) {
            try {
              const expiryText = '⏰ Expired — no action taken.';
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
                expiryCardBlocks,
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
              const expiredNotifyText = `⏰ Expired — no action taken.`;
              const notifyExpiryBlocks = notifyBlocks({
                state: 'Expired',
                archetypeName: (archetype.role_name as string) ?? 'unknown',
                enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
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
          await patchTask(supabaseUrl, headers, taskId, { status: 'Approved' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Approved', 'Reviewing');
          log.info({ taskId }, 'State: Approved');

          await patchTask(supabaseUrl, headers, taskId, { status: 'Delivering' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Delivering', 'Approved');
          log.info({ taskId }, 'State: Delivering');

          if (editedContent) {
            const rawDeliverableContent = deliverable?.content as string | undefined;
            // Extract just the draftResponse text for rule extraction — passing the full JSON blob
            // causes the LLM to fail to identify what changed between original and edited.
            let originalDraft: string | undefined;
            try {
              const parsed = JSON.parse(rawDeliverableContent ?? '{}') as Record<string, unknown>;
              originalDraft =
                typeof parsed.draft === 'string' ? parsed.draft : rawDeliverableContent;
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
                  // If content is not valid JSON, replace entirely with a minimal object
                  updatedContent = JSON.stringify({ draft: editedContent });
                }
                const patchRes = await fetch(
                  `${supabaseUrl}/rest/v1/deliverables?id=eq.${deliverableId}`,
                  {
                    method: 'PATCH',
                    headers,
                    body: JSON.stringify({
                      content: updatedContent,
                      updated_at: new Date().toISOString(),
                    }),
                  },
                );
                if (!patchRes.ok) {
                  log.warn(
                    { taskId, deliverableId },
                    'Failed to patch deliverable content with editedContent (non-fatal)',
                  );
                } else {
                  log.info(
                    { taskId, deliverableId },
                    'Deliverable content patched with editedContent',
                  );
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
              log.warn(
                { taskId, err },
                'Failed to update task metadata draft_response (non-fatal)',
              );
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
            const configFailText = `❌ Task failed — missing delivery configuration`;
            if (approvalMsgTs && targetChannel) {
              try {
                await slackClient.updateMessage(targetChannel, approvalMsgTs, configFailText, [
                  { type: 'section', text: { type: 'mrkdwn', text: configFailText } },
                  { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
                ]);
              } catch (err) {
                log.warn(
                  { taskId, err },
                  'Failed to update approval card on config error (non-fatal)',
                );
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
                    text: 'Task failed — missing delivery configuration',
                  }),
                );
              } catch (err) {
                log.warn(
                  { taskId, err },
                  'Failed to update notify-received on config error (non-fatal)',
                );
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
              ]);
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
                confidence:
                  typeof metadata['confidence'] === 'number' ? metadata['confidence'] : undefined,
                category: metadata['category'] as string | undefined,
                threadUid: metadata['thread_uid'] as string | undefined,
                leadUid: metadata['lead_uid'] as string | undefined,
                taskId,
              });
              await slackClient.postMessage({
                channel: targetChannel,
                thread_ts: approvalMsgTs,
                text: '📋 Message context preserved for reference',
                blocks: contextBlocks as import('@slack/web-api').KnownBlock[],
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
                enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
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

          const deliveryVmSize =
            (archetype.vm_size as string | null) ??
            process.env['WORKER_VM_SIZE'] ??
            process.env['SUMMARIZER_VM_SIZE'] ??
            'shared-cpu-1x';
          const deliveryImage =
            process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';
          const deliveryFlyApp =
            process.env['FLY_WORKER_APP'] ??
            process.env['FLY_SUMMARIZER_APP'] ??
            'ai-employee-workers';
          const effectiveSupabaseUrlForDelivery =
            process.env.WORKER_RUNTIME === 'fly' ? await getTunnelUrl() : supabaseUrl;

          let deliveryFinalStatus = '';
          const deliveryBaseName = `employee-delivery-${taskId.slice(0, 8)}`;
          for (let attempt = 0; attempt < 3; attempt++) {
            const deliveryContainerName =
              attempt === 0 ? deliveryBaseName : `${deliveryBaseName}-retry${attempt}`;
            if (attempt > 0 && process.env.WORKER_RUNTIME !== 'fly') {
              const prevName =
                attempt === 1 ? deliveryBaseName : `${deliveryBaseName}-retry${attempt - 1}`;
              stopLocalDockerContainer(prevName);
            }
            let deliveryMachine: { id: string };
            if (process.env.WORKER_RUNTIME !== 'fly') {
              deliveryMachine = runLocalDockerContainer({
                taskId,
                name: deliveryContainerName,
                env: {
                  ...tenantEnvForApproval,
                  TASK_ID: taskId,
                  EMPLOYEE_PHASE: 'delivery',
                  EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown',
                  APPROVAL_REQUIRED: String(approvalRequired),
                  NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
                  SUPABASE_URL: supabaseUrl.replace(
                    /localhost|127\.0\.0\.1/,
                    'host.docker.internal',
                  ),
                  SUPABASE_SECRET_KEY: supabaseKey,
                  INNGEST_BASE_URL: 'http://host.docker.internal:8288',
                  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY ?? 'local',
                  INNGEST_DEV: '1',
                  ...(taskRawEvent['lead_uid'] ? { LEAD_UID: taskRawEvent['lead_uid'] } : {}),
                  ...(taskRawEvent['thread_uid'] ? { THREAD_UID: taskRawEvent['thread_uid'] } : {}),
                  ...(taskRawEvent['property_uid']
                    ? { PROPERTY_UID: taskRawEvent['property_uid'] }
                    : {}),
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
                  ...tenantEnvForApproval,
                  TASK_ID: taskId,
                  EMPLOYEE_PHASE: 'delivery',
                  EMPLOYEE_ROLE_NAME: (archetype.role_name as string) ?? 'unknown',
                  APPROVAL_REQUIRED: String(approvalRequired),
                  NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
                  SUPABASE_URL: effectiveSupabaseUrlForDelivery,
                  SUPABASE_SECRET_KEY: supabaseKey,
                  ...(taskRawEvent['lead_uid'] ? { LEAD_UID: taskRawEvent['lead_uid'] } : {}),
                  ...(taskRawEvent['thread_uid'] ? { THREAD_UID: taskRawEvent['thread_uid'] } : {}),
                  ...(taskRawEvent['property_uid']
                    ? { PROPERTY_UID: taskRawEvent['property_uid'] }
                    : {}),
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
              const res = await fetch(
                `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=status`,
                { headers },
              );
              const rows = (await res.json()) as Array<{ status: string }>;
              finalStatus = rows[0]?.status ?? '';
              if (finalStatus === 'Done' || finalStatus === 'Failed') break;
            }
            deliveryFinalStatus = finalStatus;

            if (process.env.WORKER_RUNTIME === 'fly') {
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
              if (approvalMsgTs && targetChannel) {
                const errorText = `❌ Delivery failed after 3 attempts. Task \`${taskId}\` marked as failed.`;
                try {
                  await slackClient.updateMessage(targetChannel, approvalMsgTs, errorText, [
                    { type: 'section', text: { type: 'mrkdwn', text: errorText } },
                    { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
                  ]);
                } catch (err) {
                  log.warn(
                    { taskId, approvalMsgTs, targetChannel, err },
                    'Error message update failed (non-fatal)',
                  );
                }
              }
              if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
                try {
                  const deliveryFailText = `❌ Task failed — delivery unsuccessful`;
                  const delivFailBlocks = notifyBlocks({
                    state: 'Delivery failed',
                    archetypeName: (archetype.role_name as string) ?? 'unknown',
                    enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
                    emoji: '❌',
                  });
                  await slackClient.updateMessage(
                    notifyMsgRef.channel,
                    notifyMsgRef.ts,
                    deliveryFailText,
                    delivFailBlocks,
                  );
                } catch (err) {
                  log.warn(
                    { taskId, err },
                    'Failed to update notify-received on delivery failure (non-fatal)',
                  );
                }
              }
            }
          }

          if (deliveryFinalStatus === 'Done' && approvalMsgTs && targetChannel) {
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
                sentSnippet: (
                  editedContent ?? (metadata['draft_response'] as string | undefined)
                )?.slice(0, 150),
                taskId,
              });
              await slackClient.updateMessage(
                targetChannel,
                approvalMsgTs,
                sentText,
                doneBlocks as import('@slack/web-api').KnownBlock[],
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
                  enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
                  emoji: '✅',
                  extraText: `Approved by <@${actorUserId}>`,
                  sentSnippet: (
                    editedContent ?? (metadata['draft_response'] as string | undefined)
                  )?.slice(0, 150),
                  threadHint: true,
                });
                await slackClient.updateMessage(
                  notifyMsgRef.channel,
                  notifyMsgRef.ts,
                  sentNotifyText,
                  notifyDoneBlocks as import('@slack/web-api').KnownBlock[],
                );
              } catch (err) {
                log.warn(
                  { taskId, err },
                  'Failed to update notify-received after delivery (non-fatal)',
                );
              }
            }
            await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
          }
        } else if (action === 'superseded') {
          log.info({ taskId }, 'Task superseded by newer message for same conversation');
          if (approvalMsgTs && targetChannel) {
            try {
              await slackClient.updateMessage(
                targetChannel,
                approvalMsgTs,
                '⏭️ Superseded',
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
              const supersededNotifyText = `⏭️ Superseded`;
              const supersededNotifyBlocks = notifyBlocks({
                state: 'Superseded',
                archetypeName: (archetype.role_name as string) ?? 'unknown',
                enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
                emoji: '⏭️',
              });
              await slackClient.updateMessage(
                notifyMsgRef.channel,
                notifyMsgRef.ts,
                supersededNotifyText,
                supersededNotifyBlocks,
              );
            } catch (err) {
              log.warn(
                { taskId, err },
                'Failed to update notify-received on supersede (non-fatal)',
              );
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
              log.info(
                { taskId, retryNudgeTs },
                'Supersede branch: orphaned nudge deleted on re-read',
              );
            }
          } catch (err) {
            log.warn(
              { taskId, err },
              'Supersede branch: failed to clean up nudge on re-read (non-fatal)',
            );
          }
        } else {
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
                log.warn(
                  { taskId },
                  'Failed to store rejectionReason in task metadata (non-fatal)',
                );
              } else {
                log.info({ taskId }, 'Rejection reason stored in task metadata');
              }
            } catch (err) {
              log.warn(
                { taskId, err },
                'Error storing rejectionReason in task metadata (non-fatal)',
              );
            }
          }

          // Store rejection reason in feedback_events table (in addition to task metadata)
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
              log.warn(
                { taskId, err },
                'Failed to store rejection_reason in feedback_events (non-fatal)',
              );
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
              log.warn(
                { taskId, err },
                'Failed to fire rule extraction for rejection_reason (non-fatal)',
              );
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
                rejectedBlocks as import('@slack/web-api').KnownBlock[],
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
                confidence:
                  typeof metadata['confidence'] === 'number' ? metadata['confidence'] : undefined,
                category: metadata['category'] as string | undefined,
                threadUid: metadata['thread_uid'] as string | undefined,
                leadUid: metadata['lead_uid'] as string | undefined,
                taskId,
              });
              await slackClient.postMessage({
                channel: targetChannel,
                thread_ts: approvalMsgTs,
                text: '📋 Message context preserved for reference',
                blocks: contextBlocks as import('@slack/web-api').KnownBlock[],
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
                enrichment: notifyMsgRef.enrichment as NotificationEnrichment | null,
                emoji: '❌',
                extraText: `Rejected by <@${actorUserId}>`,
              });
              await slackClient.updateMessage(
                notifyMsgRef.channel,
                notifyMsgRef.ts,
                rejectedNotifyText,
                notifyRejectBlocks as import('@slack/web-api').KnownBlock[],
              );
            } catch (err) {
              log.warn(
                { taskId, err },
                'Failed to update notify-received on rejection (non-fatal)',
              );
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
              log.warn(
                { taskId, err },
                'Failed to post rejection feedback solicitation (non-fatal)',
              );
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
                log.info(
                  { taskId },
                  'awaiting_input employee_rule created for rejection without reason',
                );
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
          if ((machineId as string).startsWith('docker_')) {
            stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
          } else {
            const flyApp =
              process.env['FLY_WORKER_APP'] ??
              process.env['FLY_SUMMARIZER_APP'] ??
              'ai-employee-workers';
            await destroyMachine(flyApp, machineId as string);
          }
        } catch (err) {
          log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
        }
      });
    },
  );
}
