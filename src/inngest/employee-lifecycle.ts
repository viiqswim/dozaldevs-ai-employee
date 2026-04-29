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
import { buildSupersededBlocks } from '../lib/slack-blocks.js';
import {
  clearPendingApprovalByTaskId,
  getPendingApproval,
  trackPendingApproval,
  clearPendingApproval,
} from './lib/pending-approvals.js';

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

        // Infinite loop guard: if this is a reply-anyway re-draft, force approval flow
        const taskMetaRes = await fetch(
          `${supabaseUrlInner}/rest/v1/tasks?id=eq.${taskId}&select=metadata`,
          { headers },
        );
        const taskMetaRows = (await taskMetaRes.json()) as Array<{
          metadata: Record<string, unknown> | null;
        }>;
        const taskMeta = (taskMetaRows[0]?.metadata ?? {}) as Record<string, unknown>;
        if (taskMeta.reply_anyway === true) {
          return { skipApproval: false };
        }

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
        await step.run('cleanup-no-action', async () => {
          try {
            const flyApp =
              process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
            await destroyMachine(flyApp, machineId as string);
          } catch (err) {
            log.warn({ machineId, err }, 'Failed to destroy machine — may have auto-destroyed');
          }
        });

        const replyAnywayEvent = await step.waitForEvent('wait-for-reply-anyway', {
          event: 'employee/reply-anyway.requested',
          match: 'data.taskId',
          timeout: `${timeoutHours}h`,
        });

        if (!replyAnywayEvent) {
          await step.run('complete-no-action-timeout', async () => {
            await patchTask(supabaseUrl, headers, taskId, { status: 'Done' });
            await logStatusTransition(supabaseUrl, headers, taskId, 'Done', 'Submitting');
            log.info({ taskId }, 'State: Done (NO_ACTION_NEEDED — 24h timeout, no Reply Anyway)');
          });
          return;
        }

        const { userId: replyUserId } = replyAnywayEvent.data as {
          taskId: string;
          userId: string;
          userName: string;
        };

        await step.run('mark-reply-anyway-override', async () => {
          await patchTask(supabaseUrl, headers, taskId, {
            status: 'Executing',
            metadata: {
              overridden_no_action: true,
              reply_anyway: true,
              reply_anyway_by: replyUserId,
              reply_anyway_at: new Date().toISOString(),
            },
          });
          await logStatusTransition(supabaseUrl, headers, taskId, 'Executing', 'Submitting');
          log.info(
            { taskId, userId: replyUserId },
            'Reply Anyway override — spawning re-draft machine',
          );
        });

        const replyContext = await step.run('build-reply-context', async () => {
          const delivRes = await fetch(
            `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=content&order=created_at.desc&limit=1`,
            { headers },
          );
          const delivRows = (await delivRes.json()) as Array<{ content: string }>;
          const content = delivRows[0]?.content ?? '';
          const parsed = parseClassifyResponse(content);
          return JSON.stringify({
            guestName: parsed.guestName ?? 'Unknown',
            propertyName: parsed.propertyName ?? 'Unknown',
            checkIn: parsed.checkIn ?? '',
            checkOut: parsed.checkOut ?? '',
            bookingChannel: parsed.bookingChannel ?? '',
            originalMessage: parsed.originalMessage ?? '',
            summary: parsed.summary,
            leadUid: parsed.leadUid ?? '',
            threadUid: parsed.threadUid ?? '',
            messageUid: parsed.messageUid ?? '',
            conversationSummary: parsed.conversationSummary ?? '',
          });
        });

        const replyMachineId = await step.run('reply-anyway-execute', async () => {
          const vmSize = process.env.SUMMARIZER_VM_SIZE ?? 'shared-cpu-1x';
          const image =
            process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';
          const flyApp =
            process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';
          const effectiveSupabaseUrl =
            process.env.USE_FLY_HYBRID === '1' ? await getTunnelUrl() : supabaseUrl;

          const prismaForReply = new PrismaClient();
          const tenantEnvForReply = await loadTenantEnv(tenantId, {
            tenantRepo: new TenantRepository(prismaForReply),
            secretRepo: new TenantSecretRepository(prismaForReply),
          });
          await prismaForReply.$disconnect();

          const machine = await createMachine(flyApp, {
            image,
            vm_size: vmSize,
            auto_destroy: true,
            kill_timeout: 1800,
            cmd: ['node', '/app/dist/workers/opencode-harness.mjs'],
            env: {
              ...tenantEnvForReply,
              TASK_ID: taskId,
              TENANT_ID: tenantId,
              ISSUES_SLACK_CHANNEL: process.env['ISSUES_SLACK_CHANNEL'] ?? '',
              SUPABASE_URL: effectiveSupabaseUrl,
              SUPABASE_SECRET_KEY: supabaseKey,
              REPLY_ANYWAY_CONTEXT: replyContext,
            },
          });
          log.info({ taskId, machineId: machine.id }, 'Reply Anyway re-draft machine spawned');
          return machine.id;
        });

        const replyDraftStatus = await step.run('reply-anyway-poll', async () => {
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

        if (replyDraftStatus === 'Failed') {
          log.error({ taskId }, 'Reply Anyway re-draft machine failed — task remains Failed');
          return;
        }

        void replyMachineId;
      }

      // ── Supersede Detection ──────────────────────────────────────────────────
      await step.run('check-supersede', async () => {
        // Read conversation_ref from deliverable metadata
        const delivRes = await fetch(
          `${supabaseUrl}/rest/v1/deliverables?external_ref=eq.${taskId}&select=metadata&order=created_at.desc&limit=1`,
          { headers },
        );
        const delivRows = (await delivRes.json()) as Array<{
          metadata: Record<string, unknown> | null;
        }>;
        const delivMeta = (delivRows[0]?.metadata as Record<string, unknown>) ?? {};
        const conversationRef = delivMeta.conversation_ref as string | undefined;

        if (!conversationRef) {
          // No conversation ref — not a guest message task, skip superseding
          return;
        }

        const pending = await getPendingApproval(
          supabaseUrl,
          supabaseKey,
          tenantId,
          conversationRef,
        );
        if (!pending || pending.taskId === taskId) {
          // No pending approval for this conversation, or it's the same task
          return;
        }

        // Check if old task is still in Reviewing state ("approve wins the race")
        const oldTaskRes = await fetch(
          `${supabaseUrl}/rest/v1/tasks?id=eq.${pending.taskId}&select=status`,
          { headers },
        );
        const oldTaskRows = (await oldTaskRes.json()) as Array<{ status: string }>;
        const oldTaskStatus = oldTaskRows[0]?.status;

        if (oldTaskStatus !== 'Reviewing') {
          // PM already acted — clear stale entry, don't supersede
          log.info(
            { taskId, oldTaskId: pending.taskId, oldTaskStatus },
            'Stale pending approval found (old task already acted on) — clearing',
          );
          await clearPendingApproval(supabaseUrl, supabaseKey, tenantId, conversationRef);
          return;
        }

        // Old task is still Reviewing — supersede it
        log.info(
          { taskId, oldTaskId: pending.taskId, conversationRef },
          'Superseding old task for same conversation',
        );

        // Update old Slack card to show superseded state
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
            pending.channelId,
            pending.slackTs,
            '⏭️ Superseded',
            buildSupersededBlocks(),
          );
        } catch (err) {
          log.warn(
            { taskId, oldTaskId: pending.taskId, err },
            'Failed to update superseded Slack card (non-fatal)',
          );
        }

        // Fire superseded event to unblock old lifecycle's waitForEvent
        await inngest.send({
          name: 'employee/approval.received',
          data: {
            taskId: pending.taskId,
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

      await step.run('track-pending-approval', async () => {
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

        if (!conversationRef || !approvalMsgTs || !targetChannel) {
          return;
        }

        await trackPendingApproval(supabaseUrl, supabaseKey, {
          tenantId,
          threadUid: conversationRef,
          taskId,
          slackTs: approvalMsgTs,
          channelId: targetChannel,
          guestName: delivMeta.guest_name as string | undefined,
          propertyName: delivMeta.property_name as string | undefined,
          urgency: delivMeta.urgency as boolean | undefined,
        });
        log.info({ taskId, conversationRef }, 'Pending approval tracked');
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

          let deliveryFinalStatus = '';
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
            deliveryFinalStatus = finalStatus;

            try {
              await destroyMachine(deliveryFlyApp, deliveryMachine.id);
            } catch (err) {
              log.warn(
                { taskId, deliveryMachineId: deliveryMachine.id, err },
                'Failed to destroy delivery machine',
              );
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
                const errorText = `❌ Failed to send response to guest after 3 attempts. Task \`${taskId}\` marked as failed.`;
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
            }
          }

          if (deliveryFinalStatus === 'Done' && approvalMsgTs && targetChannel) {
            const sentText = `✅ Sent to guest at ${new Date().toISOString()}`;
            try {
              await slackClient.updateMessage(targetChannel, approvalMsgTs, sentText, [
                { type: 'section', text: { type: 'mrkdwn', text: sentText } },
                { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
              ]);
            } catch (err) {
              log.warn(
                { taskId, approvalMsgTs, targetChannel, err },
                'Sent message update failed (non-fatal)',
              );
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
                buildSupersededBlocks(),
              );
            } catch (err) {
              log.warn(
                { taskId, approvalMsgTs, targetChannel, err },
                'Superseded message update failed (non-fatal)',
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
              await fetch(`${supabaseUrl}/rest/v1/feedback`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  task_id: taskId,
                  feedback_type: 'rejection_reason',
                  correction_reason: rejectionReason,
                  created_by: actorUserId,
                  tenant_id: tenantId,
                  original_decision: null,
                  corrected_decision: null,
                }),
              });
              log.info({ taskId }, 'Rejection reason stored in feedback table');
            } catch (err) {
              log.warn(
                { taskId, err },
                'Failed to store rejection reason in feedback table (non-fatal)',
              );
            }
          }

          // Set rejection feedback flags so interaction handler can route replies as rejection_reason
          try {
            const currentMetaRes = await fetch(
              `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=metadata`,
              { headers },
            );
            const currentMetaRows = (await currentMetaRes.json()) as Array<{
              metadata: Record<string, unknown> | null;
            }>;
            const currentMeta = currentMetaRows[0]?.metadata ?? {};
            await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({
                metadata: {
                  ...currentMeta,
                  rejection_feedback_requested: true,
                  rejection_user_id: actorUserId,
                },
                updated_at: new Date().toISOString(),
              }),
            });
            log.info({ taskId, actorUserId }, 'Rejection feedback flags set in task metadata');
          } catch (err) {
            log.warn({ taskId, err }, 'Failed to set rejection feedback flags (non-fatal)');
          }

          // Post thread reply in approval message thread asking for feedback
          if (approvalMsgTs && targetChannel) {
            try {
              const feedbackPromptText = `Got it, <@${actorUserId}>. What should I have done differently? (Reply here — I'll learn from it.)`;
              await slackClient.postMessage({
                channel: targetChannel,
                thread_ts: approvalMsgTs,
                text: feedbackPromptText,
                blocks: [
                  { type: 'section', text: { type: 'mrkdwn', text: feedbackPromptText } },
                  { type: 'context', elements: [{ type: 'mrkdwn', text: `Task \`${taskId}\`` }] },
                ],
              });
              log.info({ taskId, approvalMsgTs }, 'Rejection feedback prompt posted in thread');
            } catch (err) {
              log.warn(
                { taskId, approvalMsgTs, targetChannel, err },
                'Failed to post rejection feedback prompt (non-fatal)',
              );
            }
          }

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
          await clearPendingApprovalByTaskId(supabaseUrl, supabaseKey, taskId);
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
