import { execSync, spawn } from 'node:child_process';
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
import { checkLastMessageSender } from '../lib/hostfully-precheck.js';
import { fetchLeadEnrichment } from '../lib/hostfully-enrichment.js';
import {
  buildSupersededBlocks,
  buildEnrichedNotifyBlocks,
  buildNotifyStateBlocks,
  buildNoActionThreadBlocks,
  buildOverrideCardBlocks,
  buildEnrichedTerminalBlocks,
  buildContextThreadBlocks,
} from '../lib/slack-blocks.js';
import {
  clearPendingApprovalByTaskId,
  getPendingApproval,
  trackPendingApproval,
  clearPendingApproval,
} from './lib/pending-approvals.js';

const log = createLogger('employee-lifecycle');

export const MAX_LEARNED_RULES_CHARS = 8000;
export const CONSOLIDATION_THRESHOLD = 5;
export const MAX_FEEDBACK_CONTEXT_CHARS = 32000;

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
  const dockerCmd = `docker run -d --rm --add-host=host.docker.internal:host-gateway --name ${JSON.stringify(opts.name)} ${envArgs} ai-employee-worker:latest ${cmd.join(' ')}`;
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
    async ({ event, step }) => {
      const { taskId, archetypeId } = event.data as { taskId: string; archetypeId: string };

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
      const timeoutHours = (riskModel.timeout_hours as number) ?? 24;
      const tenantId = taskData.tenant_id as string | undefined;
      if (!tenantId) {
        throw new Error('Task is missing tenant_id — cannot proceed with lifecycle');
      }

      // ── Pre-check: skip host-sent messages before any notification or worker ──
      if (archetype.role_name === 'guest-messaging') {
        const rawEventForCheck = (taskData.raw_event as Record<string, string> | null) ?? {};
        const leadUidForCheck = rawEventForCheck['lead_uid'] ?? '';
        if (leadUidForCheck) {
          const skipTask = await step.run('pre-check-skip-host-message', async () => {
            const prismaForCheck = new PrismaClient();
            const tenantEnvForCheck = await loadTenantEnv(
              tenantId,
              {
                tenantRepo: new TenantRepository(prismaForCheck),
                secretRepo: new TenantSecretRepository(prismaForCheck),
              },
              null,
            );
            await prismaForCheck.$disconnect();
            const apiKey = tenantEnvForCheck['HOSTFULLY_API_KEY'] ?? '';
            const result = await checkLastMessageSender(leadUidForCheck, apiKey);
            return result.lastSenderIsHost;
          });

          if (skipTask) {
            await step.run('skip-host-message-done', async () => {
              await patchTask(supabaseUrl, headers, taskId, { status: 'Done' });
              await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Received');
              log.info(
                { taskId },
                'Pre-check: last message from host — skipping (no worker, no notification)',
              );
            });
            return;
          }
        }
      }

      // ── State: Triaging ──────────────────────────────────────────────────────
      // Auto-passes: no triage logic implemented yet — all tasks are unambiguous
      await step.run('triaging', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Triaging' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Triaging', 'Received');
        log.info({ taskId }, 'State: Triaging (auto-pass)');
      });

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

          let enrichment: import('../lib/hostfully-enrichment.js').LeadEnrichment | null = null;
          if ((archetype.role_name as string) === 'guest-messaging') {
            const rawEventForEnrich = (taskData.raw_event as Record<string, string> | null) ?? {};
            const leadUidForEnrich = rawEventForEnrich['lead_uid'] ?? '';
            const messageContent = rawEventForEnrich['message_content'] ?? '';
            const apiKey = tenantEnvForNotify['HOSTFULLY_API_KEY'] ?? '';
            if (leadUidForEnrich && apiKey) {
              enrichment = await fetchLeadEnrichment(leadUidForEnrich, apiKey);
            }
            const blocks = enrichment
              ? buildEnrichedNotifyBlocks({
                  guestName: enrichment.guestName ?? 'Guest',
                  propertyName: enrichment.propertyName ?? undefined,
                  checkIn: enrichment.checkIn ?? undefined,
                  checkOut: enrichment.checkOut ?? undefined,
                  bookingChannel: enrichment.bookingChannel ?? undefined,
                  messageSnippet: messageContent || undefined,
                  taskId,
                })
              : [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: `⏳ *Task received* — processing\n_Employee: ${roleName}_`,
                    },
                  },
                  {
                    type: 'context',
                    elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
                  },
                ];
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
          }

          const genericBlocks = [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `⏳ *Task received* — processing\n_Employee: ${roleName}_`,
              },
            },
            {
              type: 'context',
              elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }],
            },
          ];
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
                genericBlocks,
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
              return { ts: supersededNotifyTs, channel: supersededNotifyChannel, enrichment: null };
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
            blocks: genericBlocks,
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
          return { ts: result.ts, channel, enrichment: null };
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to send received notification (non-fatal)');
          return { ts: null, channel: null };
        }
      });

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

        const vmSize = process.env.SUMMARIZER_VM_SIZE ?? 'shared-cpu-1x';
        const image = process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';
        const flyApp =
          process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';

        const effectiveSupabaseUrl =
          process.env.USE_FLY_HYBRID === '1' ? await getTunnelUrl() : supabaseUrl;

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

        const runtime = (archetype.runtime as string | null) ?? 'generic-harness';
        const cmd =
          runtime === 'opencode'
            ? ['node', '/app/dist/workers/opencode-harness.mjs']
            : ['node', '/app/dist/workers/generic-harness.mjs'];

        let feedbackContext = '';
        try {
          const kbRes = await fetch(
            `${supabaseUrl}/rest/v1/knowledge_bases?archetype_id=eq.${archetypeId}&select=source_config&order=created_at.desc`,
            { headers },
          );
          const kbRows = (await kbRes.json()) as Array<{ source_config: unknown }>;

          const fbRes = await fetch(
            `${supabaseUrl}/rest/v1/feedback?tenant_id=eq.${tenantId}&consolidated_at=is.null&select=correction_reason,feedback_type,created_at&order=created_at.desc`,
            { headers },
          );
          const fbRows = (await fbRes.json()) as Array<{
            correction_reason: string | null;
            feedback_type: string;
            created_at: string;
          }>;

          const parts: string[] = [];

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
              parts.push('Your feedback themes (consolidated knowledge):');
              for (const t of themes) {
                parts.push(
                  `- ${t.theme}: "${t.representative_quote}" (${t.frequency} occurrences)`,
                );
              }
            }
          }

          if (fbRows.length > 0) {
            const withReason = fbRows.filter((f) => f.correction_reason);
            if (withReason.length > 0) {
              parts.push('All unconsolidated feedback (newest first):');
              for (const f of withReason) {
                const date = new Date(f.created_at).toLocaleDateString();
                parts.push(`- [${f.feedback_type}] "${f.correction_reason}" (${date})`);
              }
            }
          }

          feedbackContext = parts.join('\n');

          if (feedbackContext.length > MAX_FEEDBACK_CONTEXT_CHARS) {
            log.warn(
              {
                taskId,
                contextLen: feedbackContext.length,
                maxLen: MAX_FEEDBACK_CONTEXT_CHARS,
              },
              'Feedback context truncated — consolidation needed',
            );
            feedbackContext = feedbackContext.slice(0, MAX_FEEDBACK_CONTEXT_CHARS);
          }

          log.info(
            {
              taskId,
              feedbackItems: fbRows.filter((f) => f.correction_reason).length,
              kbThemes: kbRows.length,
              feedbackContextLen: feedbackContext.length,
            },
            'Feedback context assembled',
          );
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to load feedback context — proceeding without it');
        }

        let learnedRulesContext = '';
        try {
          const rulesRes = await fetch(
            `${supabaseUrl}/rest/v1/learned_rules?status=eq.confirmed&tenant_id=eq.${tenantId}&or=(and(entity_type.eq.archetype,entity_id.eq.${archetypeId}),scope.eq.common)&select=rule_text,entity_type,entity_id,scope,confirmed_at&order=confirmed_at.desc`,
            { headers },
          );
          const rulesRows = (await rulesRes.json()) as Array<{
            rule_text: string;
            entity_type: string | null;
            entity_id: string | null;
            scope: string;
            confirmed_at: string;
          }>;

          if (rulesRows.length > 0) {
            const sorted = [
              ...rulesRows.filter(
                (r) => r.entity_type === 'archetype' && r.entity_id === archetypeId,
              ),
              ...rulesRows.filter(
                (r) => !(r.entity_type === 'archetype' && r.entity_id === archetypeId),
              ),
            ];

            const header = '## Learned Behaviors — follow these rules';
            const lines: string[] = [];
            let charCount = 0;
            for (const rule of sorted) {
              const line = `- ${rule.rule_text}`;
              if (charCount + line.length > MAX_LEARNED_RULES_CHARS) break;
              lines.push(line);
              charCount += line.length + 1;
            }

            if (lines.length > 0) {
              learnedRulesContext = `${header}\n\n${lines.join('\n')}`;
            }
          }
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to load learned rules context — proceeding without it');
        }

        log.info({ taskId, runtime }, 'Dispatching worker machine');

        if (process.env.USE_LOCAL_DOCKER === '1') {
          const localMachine = runLocalDockerContainer({
            taskId,
            name: `employee-${taskId.slice(0, 8)}`,
            env: {
              ...tenantEnv,
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
              ...(rawEvent['thread_uid'] ? { REPLY_BROADCAST: 'true' } : {}),
              ...(feedbackContext ? { FEEDBACK_CONTEXT: feedbackContext } : {}),
              ...(learnedRulesContext ? { LEARNED_RULES_CONTEXT: learnedRulesContext } : {}),
            },
            cmd: ['node', '/app/dist/workers/opencode-harness.mjs'],
          });
          return localMachine.id;
        }

        const machine = await createMachine(flyApp, {
          image,
          vm_size: vmSize,
          auto_destroy: true,
          kill_timeout: 1800,
          cmd,
          env: {
            ...tenantEnv,
            ...rawEventEnv,
            TASK_ID: taskId,
            TENANT_ID: tenantId,
            ISSUES_SLACK_CHANNEL: process.env['ISSUES_SLACK_CHANNEL'] ?? '',
            SUPABASE_URL: effectiveSupabaseUrl,
            SUPABASE_SECRET_KEY: supabaseKey,
            NOTIFY_MSG_TS: notifyMsgRef?.ts ?? '',
            ...(rawEvent['thread_uid'] ? { REPLY_BROADCAST: 'true' } : {}),
            ...(feedbackContext ? { FEEDBACK_CONTEXT: feedbackContext } : {}),
            ...(learnedRulesContext ? { LEARNED_RULES_CONTEXT: learnedRulesContext } : {}),
          },
        });

        return machine.id;
      });

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
          if (status === 'Submitting' || status === 'Failed') return status;
        }
        return 'Failed';
      });

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
                const failedEnrichment = notifyMsgRef.enrichment as
                  | {
                      guestName?: string;
                      propertyName?: string;
                      threadUid?: string;
                      leadUid?: string;
                    }
                  | undefined;
                const notifyFailedBlocks = failedEnrichment?.guestName
                  ? buildEnrichedTerminalBlocks({
                      status: 'failed',
                      guestName: failedEnrichment.guestName,
                      propertyName: failedEnrichment.propertyName,
                      threadUid: failedEnrichment.threadUid,
                      leadUid: failedEnrichment.leadUid,
                      taskId,
                    })
                  : buildNotifyStateBlocks({ emoji: '❌', text: 'Task failed', taskId });
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
                process.env.FLY_SUMMARIZER_APP ??
                process.env.FLY_WORKER_APP ??
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

      // ── State: Submitting ────────────────────────────────────────────────────
      await step.run('submitting', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Submitting' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Submitting', 'Validating');
        log.info({ taskId }, 'State: Submitting');
      });

      if (!approvalRequired) {
        // ── State: Done (no approval needed) ────────────────────────────────────
        await step.run('complete', async () => {
          await patchTask(supabaseUrl, headers, taskId, { status: 'Done' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Submitting');
          log.info({ taskId }, 'State: Done (no approval required)');
          if (notifyMsgRef?.ts && notifyMsgRef?.channel) {
            try {
              const prismaForDone = new PrismaClient();
              const tenantEnvForDone = await loadTenantEnv(
                tenantId,
                {
                  tenantRepo: new TenantRepository(prismaForDone),
                  secretRepo: new TenantSecretRepository(prismaForDone),
                },
                (archetype.notification_channel as string | null) ?? null,
              );
              await prismaForDone.$disconnect();
              const botTokenForDone = tenantEnvForDone['SLACK_BOT_TOKEN'] ?? '';
              if (botTokenForDone) {
                const slackForDone = createSlackClient({
                  botToken: botTokenForDone,
                  defaultChannel: '',
                });
                const doneText = `✅ Task complete`;
                await slackForDone.updateMessage(
                  notifyMsgRef.channel,
                  notifyMsgRef.ts,
                  doneText,
                  buildNotifyStateBlocks({ emoji: '✅', text: 'Task complete', taskId }),
                );
              }
            } catch (err) {
              log.warn(
                { taskId, err },
                'Failed to update notify-received on completion (non-fatal)',
              );
            }
          }
        });
        await step.run('cleanup-no-approval', async () => {
          try {
            if ((machineId as string).startsWith('docker_')) {
              stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
            } else {
              const flyApp =
                process.env.FLY_SUMMARIZER_APP ??
                process.env.FLY_WORKER_APP ??
                'ai-employee-workers';
              await destroyMachine(flyApp, machineId as string);
            }
          } catch (err) {
            log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
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
                process.env.FLY_SUMMARIZER_APP ??
                process.env.FLY_WORKER_APP ??
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
            await patchTask(supabaseUrl, headers, taskId, { status: 'Done' });
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
                  buildNotifyStateBlocks({ emoji: '✅', text: 'No action needed', taskId }),
                );
                await updateOverrideCard(resolvedText, slackForTimeout);
              }
            } catch (err) {
              log.warn({ taskId, err }, 'Failed to update Slack on no-action timeout (non-fatal)');
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
            await patchTask(supabaseUrl, headers, taskId, { status: 'Done' });
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
                  buildNotifyStateBlocks({
                    emoji: '✅',
                    text: 'No action needed — dismissed',
                    taskId,
                  }),
                );
              }
            } catch (err) {
              log.warn({ taskId, err }, 'Failed to update Slack on override dismiss (non-fatal)');
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
          await slackForReviewing.updateMessage(
            notifyMsgRef.channel,
            notifyMsgRef.ts,
            reviewingText,
            buildNotifyStateBlocks({ emoji: '⏳', text: reviewingText, taskId }),
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

        if (!threadUidForTracking || !approvalMsgTs || !targetChannel) {
          log.warn(
            { taskId, threadUidForTracking, approvalMsgTs, targetChannel },
            'track-pending-approval: Missing required metadata — approval card may not have been posted. Task will proceed to wait-for-approval but may timeout.',
          );
          return;
        }

        await trackPendingApproval(supabaseUrl, supabaseKey, {
          tenantId,
          threadUid: threadUidForTracking,
          taskId,
          slackTs: approvalMsgTs,
          channelId: targetChannel,
          guestName: delivMeta.guest_name as string | undefined,
          propertyName: delivMeta.property_name as string | undefined,
          urgency: delivMeta.urgency as boolean | undefined,
        });
        log.info({ taskId, threadUidForTracking }, 'Pending approval tracked');
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

        const metadata = (deliverable?.metadata as Record<string, unknown>) ?? {};
        const approvalMsgTs = metadata.approval_message_ts as string | undefined;
        const targetChannel =
          (metadata.target_channel as string) ??
          tenantEnvForApproval['NOTIFICATION_CHANNEL'] ??
          tenantEnvForApproval['SUMMARY_TARGET_CHANNEL'] ??
          '';
        if (!approvalEvent) {
          const expiryEnrichment = notifyMsgRef?.enrichment as
            | { guestName?: string; propertyName?: string; threadUid?: string; leadUid?: string }
            | undefined;
          if (approvalMsgTs && targetChannel) {
            try {
              const expiryText = '⏰ Expired — no action taken.';
              const expiryCardBlocks = expiryEnrichment?.guestName
                ? buildEnrichedTerminalBlocks({
                    status: 'expired',
                    guestName: expiryEnrichment.guestName,
                    propertyName: expiryEnrichment.propertyName,
                    threadUid: expiryEnrichment.threadUid,
                    leadUid: expiryEnrichment.leadUid,
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
              const notifyExpiryBlocks = expiryEnrichment?.guestName
                ? buildEnrichedTerminalBlocks({
                    status: 'expired',
                    guestName: expiryEnrichment.guestName,
                    propertyName: expiryEnrichment.propertyName,
                    threadUid: expiryEnrichment.threadUid,
                    leadUid: expiryEnrichment.leadUid,
                    taskId,
                  })
                : buildNotifyStateBlocks({
                    emoji: '⏰',
                    text: 'Expired — no action taken',
                    taskId,
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
            const originalDraft = deliverable?.content as string | undefined;
            try {
              const deliverableId = deliverable?.id as string | undefined;
              if (deliverableId) {
                const currentContent = deliverable?.content as string | undefined;
                let updatedContent = currentContent ?? '{}';
                try {
                  const parsed = JSON.parse(currentContent ?? '{}') as Record<string, unknown>;
                  parsed.draftResponse = editedContent;
                  updatedContent = JSON.stringify(parsed);
                } catch {
                  // If content is not valid JSON, replace entirely with a minimal object
                  updatedContent = JSON.stringify({ draftResponse: editedContent });
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
                  buildNotifyStateBlocks({
                    emoji: '❌',
                    text: 'Task failed — missing delivery configuration',
                    taskId,
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
              await slackClient.updateMessage(
                notifyMsgRef.channel,
                notifyMsgRef.ts,
                approvedNotifyText,
                buildNotifyStateBlocks({
                  emoji: '⏳',
                  text: `Approved by <@${actorUserId}> — delivering now`,
                  taskId,
                }),
              );
            } catch (err) {
              log.warn({ taskId, err }, 'Failed to update notify-received on approval (non-fatal)');
            }
          }

          const deliveryVmSize = process.env.SUMMARIZER_VM_SIZE ?? 'shared-cpu-1x';
          const deliveryImage =
            process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';
          const deliveryFlyApp =
            process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
          const effectiveSupabaseUrlForDelivery =
            process.env.USE_FLY_HYBRID === '1' ? await getTunnelUrl() : supabaseUrl;

          let deliveryFinalStatus = '';
          for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0 && process.env.USE_LOCAL_DOCKER === '1') {
              stopLocalDockerContainer(`employee-delivery-${taskId.slice(0, 8)}`);
            }
            let deliveryMachine: { id: string };
            if (process.env.USE_LOCAL_DOCKER === '1') {
              deliveryMachine = runLocalDockerContainer({
                taskId,
                name: `employee-delivery-${taskId.slice(0, 8)}`,
                env: {
                  ...tenantEnvForApproval,
                  TASK_ID: taskId,
                  EMPLOYEE_PHASE: 'delivery',
                  SUPABASE_URL: supabaseUrl.replace(
                    /localhost|127\.0\.0\.1/,
                    'host.docker.internal',
                  ),
                  SUPABASE_SECRET_KEY: supabaseKey,
                  INNGEST_BASE_URL: 'http://host.docker.internal:8288',
                  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY ?? 'local',
                  INNGEST_DEV: '1',
                  HOSTFULLY_MOCK: process.env['HOSTFULLY_MOCK'] ?? '',
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
                  SUPABASE_URL: effectiveSupabaseUrlForDelivery,
                  SUPABASE_SECRET_KEY: supabaseKey,
                  HOSTFULLY_MOCK: process.env['HOSTFULLY_MOCK'] ?? '',
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

            if (process.env.USE_LOCAL_DOCKER !== '1') {
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
                  await slackClient.updateMessage(
                    notifyMsgRef.channel,
                    notifyMsgRef.ts,
                    deliveryFailText,
                    buildNotifyStateBlocks({
                      emoji: '❌',
                      text: 'Delivery failed — reply not sent',
                      taskId,
                    }),
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
                sentSnippet: (metadata['draft_response'] as string | undefined)?.slice(0, 150),
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
                const notifyDoneBlocks = terminalRecipientName
                  ? buildEnrichedTerminalBlocks({
                      status: 'done',
                      actorUserId,
                      guestName: terminalRecipientName,
                      propertyName: metadata['property_name'] as string | undefined,
                      threadUid: metadata['thread_uid'] as string | undefined,
                      leadUid: metadata['lead_uid'] as string | undefined,
                      sentSnippet: (metadata['draft_response'] as string | undefined)?.slice(
                        0,
                        150,
                      ),
                      taskId,
                    })
                  : buildNotifyStateBlocks({ emoji: '✅', text: sentNotifyText, taskId });
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
              await slackClient.updateMessage(
                notifyMsgRef.channel,
                notifyMsgRef.ts,
                supersededNotifyText,
                buildNotifyStateBlocks({
                  emoji: '⏭️',
                  text: 'Superseded — newer message received',
                  taskId,
                }),
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

          // Store rejection reason in feedback table (in addition to task metadata)
          if (rejectionReason) {
            try {
              const now = new Date().toISOString();
              const feedbackRes = await fetch(`${supabaseUrl}/rest/v1/feedback`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  id: crypto.randomUUID(),
                  task_id: taskId,
                  feedback_type: 'rejection_reason',
                  correction_reason: rejectionReason,
                  created_by: actorUserId,
                  tenant_id: tenantId,
                  original_decision: null,
                  corrected_decision: null,
                  updated_at: now,
                }),
              });
              if (!feedbackRes.ok) {
                const body = await feedbackRes.text();
                log.warn(
                  { taskId, status: feedbackRes.status, body },
                  'Failed to store rejection reason in feedback table (non-fatal)',
                );
              } else {
                log.info({ taskId }, 'Rejection reason stored in feedback table');
              }
            } catch (err) {
              log.warn(
                { taskId, err },
                'Failed to store rejection reason in feedback table (non-fatal)',
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
              const terminalRecipientName = metadata['guest_name'] as string | undefined;
              const notifyRejectBlocks = terminalRecipientName
                ? buildEnrichedTerminalBlocks({
                    status: 'rejected',
                    actorUserId,
                    guestName: terminalRecipientName,
                    propertyName: metadata['property_name'] as string | undefined,
                    threadUid: metadata['thread_uid'] as string | undefined,
                    leadUid: metadata['lead_uid'] as string | undefined,
                    taskId,
                  })
                : buildNotifyStateBlocks({
                    emoji: '❌',
                    text: `Rejected by <@${actorUserId}>`,
                    taskId,
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
              await fetch(`${supabaseUrl}/rest/v1/learned_rules`, {
                method: 'POST',
                headers: { ...headers, Prefer: 'return=minimal' },
                body: JSON.stringify({
                  id: crypto.randomUUID(),
                  tenant_id: tenantId,
                  entity_type: 'archetype',
                  entity_id: archetypeId,
                  scope: 'entity',
                  rule_text: '',
                  source: 'rejection',
                  status: 'awaiting_input',
                  source_task_id: taskId,
                  slack_ts: approvalMsgTs ?? null,
                  slack_channel: targetChannel ?? null,
                }),
              });
              log.info({ taskId }, 'Awaiting-input rule created for rejection without reason');
            } catch (err) {
              log.warn(
                { taskId, err },
                'Failed to create awaiting-input rule for rejection (non-fatal)',
              );
            }
          }

          await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
          await patchTask(supabaseUrl, headers, taskId, { status: 'Cancelled' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Cancelled', 'Reviewing');
          log.info({ taskId }, 'State: Cancelled (rejected)');
        }
      });

      await step.run('cleanup', async () => {
        try {
          if ((machineId as string).startsWith('docker_')) {
            stopLocalDockerContainer(`employee-${taskId.slice(0, 8)}`);
          } else {
            const flyApp =
              process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
            await destroyMachine(flyApp, machineId as string);
          }
        } catch (err) {
          log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
        }
      });
    },
  );
}
