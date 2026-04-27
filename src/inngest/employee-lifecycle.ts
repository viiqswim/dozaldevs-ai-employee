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

const log = createLogger('employee-lifecycle');

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

      void archetypeId;

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

      // ── State: Triaging ──────────────────────────────────────────────────────
      // Auto-passes: no triage logic implemented yet — all tasks are unambiguous
      await step.run('triaging', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Triaging' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Triaging', 'Received');
        log.info({ taskId }, 'State: Triaging (auto-pass)');
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
        const tenantEnv = await loadTenantEnv(tenantId, {
          tenantRepo: new TenantRepository(prismaClient),
          secretRepo: new TenantSecretRepository(prismaClient),
        });
        await prismaClient.$disconnect();

        const runtime = (archetype.runtime as string | null) ?? 'generic-harness';
        const cmd =
          runtime === 'opencode'
            ? ['node', '/app/dist/workers/opencode-harness.mjs']
            : ['node', '/app/dist/workers/generic-harness.mjs'];

        let feedbackContext = '';
        try {
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const kbRes = await fetch(
            `${supabaseUrl}/rest/v1/knowledge_bases?archetype_id=eq.${archetypeId}&created_at=gte.${thirtyDaysAgo}&select=source_config&order=created_at.desc&limit=3`,
            { headers },
          );
          const kbRows = (await kbRes.json()) as Array<{ source_config: unknown }>;

          const fbRes = await fetch(
            `${supabaseUrl}/rest/v1/feedback?created_at=gte.${thirtyDaysAgo}&select=correction_reason,feedback_type,created_at&order=created_at.desc&limit=10`,
            { headers },
          );
          const fbRows = (await fbRes.json()) as Array<{
            correction_reason: string | null;
            feedback_type: string;
            created_at: string;
          }>;

          const parts: string[] = [];

          if (kbRows.length > 0) {
            const themes = kbRows
              .flatMap((kb) => {
                const cfg = kb.source_config as {
                  themes?: Array<{
                    theme: string;
                    representative_quote: string;
                    frequency: number;
                  }>;
                } | null;
                return cfg?.themes ?? [];
              })
              .slice(0, 5);
            if (themes.length > 0) {
              parts.push('Your recent feedback themes (last 30 days):');
              for (const t of themes) {
                parts.push(
                  `- ${t.theme}: "${t.representative_quote}" (${t.frequency} occurrences)`,
                );
              }
            }
          }

          if (fbRows.length > 0) {
            const recent = fbRows.filter((f) => f.correction_reason).slice(0, 5);
            if (recent.length > 0) {
              parts.push('Recent specific feedback:');
              for (const f of recent) {
                const date = new Date(f.created_at).toLocaleDateString();
                parts.push(`- [${f.feedback_type}] "${f.correction_reason}" (${date})`);
              }
            }
          }

          feedbackContext = parts.join('\n');
        } catch (err) {
          log.warn({ taskId, err }, 'Failed to load feedback context — proceeding without it');
        }

        log.info({ taskId, runtime }, 'Dispatching worker machine');

        const machine = await createMachine(flyApp, {
          image,
          vm_size: vmSize,
          auto_destroy: true,
          kill_timeout: 1800,
          cmd,
          env: {
            ...tenantEnv,
            TASK_ID: taskId,
            TENANT_ID: tenantId,
            ISSUES_SLACK_CHANNEL: process.env['ISSUES_SLACK_CHANNEL'] ?? '',
            SUPABASE_URL: effectiveSupabaseUrl,
            SUPABASE_SECRET_KEY: supabaseKey,
            ...(feedbackContext ? { FEEDBACK_CONTEXT: feedbackContext } : {}),
          },
        });

        return machine.id;
      });

      // ── Poll for machine completion (Submitting or Failed) ───────────────────
      const finalStatus = await step.run('poll-completion', async () => {
        const maxPolls = 60;
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
        });
        await step.run('cleanup-on-failure', async () => {
          try {
            const flyApp =
              process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
            await destroyMachine(flyApp, machineId as string);
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
        });
        await step.run('cleanup-no-approval', async () => {
          try {
            const flyApp =
              process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
            await destroyMachine(flyApp, machineId as string);
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
            return { skipApproval: result.classification === 'NO_ACTION_NEEDED' };
          }
          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
        // No deliverable found after retries — proceed to Reviewing (safe default)
        return { skipApproval: false };
      });

      if (classificationCheck.skipApproval) {
        await step.run('complete-no-action', async () => {
          await patchTask(supabaseUrl, headers, taskId, { status: 'Done' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Submitting');
          log.info({ taskId }, 'State: Done (NO_ACTION_NEEDED — auto-completed)');
        });
        await step.run('cleanup-no-action', async () => {
          try {
            const flyApp =
              process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
            await destroyMachine(flyApp, machineId as string);
          } catch (err) {
            log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
          }
        });
        return;
      }

      // ── State: Reviewing ─────────────────────────────────────────────────────
      await step.run('set-reviewing', async () => {
        await patchTask(supabaseUrl, headers, taskId, { status: 'Reviewing' });
        await logStatusTransition(supabaseUrl, headers, taskId, 'Reviewing', 'Submitting');
        log.info({ taskId }, 'State: Reviewing — awaiting human approval');
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
          if (approvalMsgTs && targetChannel) {
            try {
              const expiryText = '⏰ Daily summary expired — no action taken.';
              await slackClient.updateMessage(targetChannel, approvalMsgTs, expiryText, [
                { type: 'section', text: { type: 'mrkdwn', text: expiryText } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
              ]);
            } catch (err) {
              log.warn(
                { taskId, approvalMsgTs, targetChannel, err },
                'Expiry message update failed (non-fatal)',
              );
            }
          }
          await patchTask(supabaseUrl, headers, taskId, { status: 'Cancelled' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Cancelled', 'Reviewing');
          return;
        }

        const { action, userId: actorUserId } = approvalEvent.data as {
          action: string;
          userId: string;
        };

        if (action === 'approve') {
          await patchTask(supabaseUrl, headers, taskId, { status: 'Approved' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Approved', 'Reviewing');
          log.info({ taskId }, 'State: Approved');

          await patchTask(supabaseUrl, headers, taskId, { status: 'Delivering' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Delivering', 'Approved');
          log.info({ taskId }, 'State: Delivering');

          const archetypeRes = await fetch(
            `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=archetypes(delivery_instructions)`,
            { headers },
          );
          const archetypeRows = (await archetypeRes.json()) as Array<{
            archetypes?: { delivery_instructions?: string | null };
          }>;
          const deliveryInstructions = archetypeRows[0]?.archetypes?.delivery_instructions;
          if (!deliveryInstructions) {
            await patchTask(supabaseUrl, headers, taskId, {
              status: 'Failed',
              failure_reason: 'Archetype missing delivery_instructions',
            });
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

          const deliveryVmSize = process.env.SUMMARIZER_VM_SIZE ?? 'shared-cpu-1x';
          const deliveryImage =
            process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';
          const deliveryFlyApp =
            process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
          const effectiveSupabaseUrlForDelivery =
            process.env.USE_FLY_HYBRID === '1' ? await getTunnelUrl() : supabaseUrl;

          for (let attempt = 0; attempt < 3; attempt++) {
            const deliveryMachine = await createMachine(deliveryFlyApp, {
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
              },
            });
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

            try {
              await destroyMachine(deliveryFlyApp, deliveryMachine.id);
            } catch (err) {
              log.warn(
                { taskId, deliveryMachineId: deliveryMachine.id, err },
                'Failed to destroy delivery machine',
              );
            }

            if (finalStatus === 'Done') break;

            if (attempt < 2) {
              log.warn({ taskId, attempt }, 'Delivery machine failed — retrying');
              await patchTask(supabaseUrl, headers, taskId, { status: 'Delivering' });
            } else {
              log.error({ taskId }, 'Delivery failed after 3 attempts — marking Failed');
              await patchTask(supabaseUrl, headers, taskId, {
                status: 'Failed',
                failure_reason: 'Delivery failed after 3 attempts',
              });
            }
          }
        } else {
          if (approvalMsgTs && targetChannel) {
            const rejectedText = `❌ Rejected by <@${actorUserId}>.`;
            try {
              await slackClient.updateMessage(targetChannel, approvalMsgTs, rejectedText, [
                { type: 'section', text: { type: 'mrkdwn', text: rejectedText } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
              ]);
            } catch (err) {
              log.warn(
                { taskId, approvalMsgTs, targetChannel, err },
                'Rejection message update failed (non-fatal)',
              );
            }
          }
          await patchTask(supabaseUrl, headers, taskId, { status: 'Cancelled' });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Cancelled', 'Reviewing');
          log.info({ taskId }, 'State: Cancelled (rejected)');
        }
      });

      await step.run('cleanup', async () => {
        try {
          const flyApp =
            process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
          await destroyMachine(flyApp, machineId as string);
        } catch (err) {
          log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
        }
      });
    },
  );
}
