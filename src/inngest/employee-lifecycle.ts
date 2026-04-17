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

const log = createLogger('employee-lifecycle');

export function createEmployeeLifecycleFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'employee/task-lifecycle',
      triggers: [{ event: 'employee/task.dispatched' }],
    },
    async ({ event, step }) => {
      const { taskId, archetypeId } = event.data as { taskId: string; archetypeId: string };

      const supabaseUrl = process.env.SUPABASE_URL!;
      const supabaseKey = process.env.SUPABASE_SECRET_KEY!;
      const headers = {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      };

      const taskData = await step.run('load-task', async () => {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}&select=*,archetypes(*)`,
          { headers },
        );
        const rows = (await res.json()) as Array<Record<string, unknown>>;
        if (!rows.length) throw new NonRetriableError(`Task not found: ${taskId}`);
        return rows[0];
      });

      void archetypeId;

      const archetype = (taskData.archetypes as Record<string, unknown>) ?? {};
      const riskModel = (archetype.risk_model as Record<string, unknown>) ?? {};
      const approvalRequired = riskModel.approval_required === true;
      const timeoutHours = (riskModel.timeout_hours as number) ?? 24;

      const machineId = await step.run('dispatch-machine', async () => {
        await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'Executing', updated_at: new Date().toISOString() }),
        });

        const vmSize = process.env.SUMMARIZER_VM_SIZE ?? 'shared-cpu-1x';
        const image = process.env.FLY_WORKER_IMAGE ?? 'registry.fly.io/ai-employee-workers:latest';
        const flyApp =
          process.env.FLY_SUMMARIZER_APP ?? process.env.FLY_WORKER_APP ?? 'ai-employee-workers';

        const effectiveSupabaseUrl =
          process.env.USE_FLY_HYBRID === '1' ? await getTunnelUrl() : supabaseUrl;

        const tenantId = (taskData.tenant_id as string) ?? '00000000-0000-0000-0000-000000000001';
        const prismaClient = new PrismaClient();
        const tenantEnv = await loadTenantEnv(tenantId, {
          tenantRepo: new TenantRepository(prismaClient),
          secretRepo: new TenantSecretRepository(prismaClient),
        });
        await prismaClient.$disconnect();

        const machine = await createMachine(flyApp, {
          image,
          vm_size: vmSize,
          auto_destroy: true,
          cmd: ['node', '/app/dist/workers/generic-harness.mjs'],
          env: {
            ...tenantEnv,
            TASK_ID: taskId,
            SUPABASE_URL: effectiveSupabaseUrl,
            SUPABASE_SECRET_KEY: supabaseKey,
          },
        });

        return machine.id;
      });

      const finalStatus = await step.run('poll-completion', async () => {
        const maxPolls = 20;
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
          await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'Failed', updated_at: new Date().toISOString() }),
          });
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
        return;
      }

      if (!approvalRequired) {
        await step.run('complete', async () => {
          await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'Done', updated_at: new Date().toISOString() }),
          });
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
        return;
      }

      await step.run('set-awaiting', async () => {
        await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({
            status: 'AwaitingApproval',
            updated_at: new Date().toISOString(),
          }),
        });
      });

      const approvalEvent = await step.waitForEvent('wait-for-approval', {
        event: 'employee/approval.received',
        match: 'data.taskId',
        timeout: `${timeoutHours}h`,
      });

      await step.run('handle-result', async () => {
        const tenantId = (taskData.tenant_id as string) ?? '00000000-0000-0000-0000-000000000001';
        const prismaForApproval = new PrismaClient();
        const tenantEnvForApproval = await loadTenantEnv(tenantId, {
          tenantRepo: new TenantRepository(prismaForApproval),
          secretRepo: new TenantSecretRepository(prismaForApproval),
        });
        await prismaForApproval.$disconnect();

        const slackClient = createSlackClient({
          botToken: tenantEnvForApproval.SLACK_BOT_TOKEN ?? process.env.SLACK_BOT_TOKEN ?? '',
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
          (metadata.target_channel as string) ?? process.env.SUMMARY_TARGET_CHANNEL ?? '';
        const summaryBlocks = metadata.blocks as unknown[] | undefined;
        const summaryContent = (deliverable?.content as string) ?? '';

        if (!approvalEvent) {
          if (approvalMsgTs && targetChannel) {
            await slackClient.updateMessage(
              targetChannel,
              approvalMsgTs,
              '⏰ Daily summary expired — no action taken.',
            );
          }
          await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'Cancelled', updated_at: new Date().toISOString() }),
          });
          return;
        }

        const { action, userName } = approvalEvent.data as {
          action: string;
          userName: string;
        };

        if (action === 'approve') {
          const publishChannel = tenantEnvForApproval['SUMMARY_PUBLISH_CHANNEL'] ?? targetChannel;
          if (publishChannel && summaryContent) {
            await slackClient.postMessage({
              channel: publishChannel,
              text: summaryContent,
              blocks: summaryBlocks,
            });
          }
          if (approvalMsgTs && targetChannel) {
            await slackClient.updateMessage(
              targetChannel,
              approvalMsgTs,
              `✅ Approved by ${userName} — summary posted.`,
            );
          }
          await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'Done', updated_at: new Date().toISOString() }),
          });
        } else {
          if (approvalMsgTs && targetChannel) {
            await slackClient.updateMessage(
              targetChannel,
              approvalMsgTs,
              `❌ Rejected by ${userName}.`,
            );
          }
          await fetch(`${supabaseUrl}/rest/v1/tasks?id=eq.${taskId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ status: 'Cancelled', updated_at: new Date().toISOString() }),
          });
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
