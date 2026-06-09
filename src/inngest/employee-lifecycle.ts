import { Inngest } from 'inngest';
import type { InngestFunction } from 'inngest';
import { createLogger } from '../lib/logger.js';
import { requireEnv } from '../lib/config.js';
import { createTaskNotifyBuilders } from '../lib/slack-blocks.js';
import { runTriageAndReady } from './lifecycle/steps/triage-and-ready.js';
import { runExecutePhase } from './lifecycle/steps/execute.js';
import { runValidateAndSubmit } from './lifecycle/steps/validate-and-submit.js';
import { makePostgrestHeaders } from './lib/postgrest-headers.js';

const log = createLogger('employee-lifecycle');

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

      const supabaseUrl = requireEnv('SUPABASE_URL');
      const supabaseKey = requireEnv('SUPABASE_SECRET_KEY');
      const headers = makePostgrestHeaders(supabaseKey);

      // ── Phase 1: Triage → Ready ──────────────────────────────────────────────
      const { taskData, archetype, approvalRequired, timeoutHours, tenantId, notifyMsgRef } =
        await runTriageAndReady(
          { taskId, archetypeId, runId, supabaseUrl, supabaseKey, headers },
          step,
          notifyBlocks,
        );

      // ── Phase 2: Execute ─────────────────────────────────────────────────────
      const executeResult = await runExecutePhase(
        {
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
        },
        step,
      );

      if (executeResult.outcome === 'terminated') {
        log.info({ taskId, runId }, 'Lifecycle ended early (terminated in execute phase)');
        return;
      }

      // ── Phase 3: Validate → Submit → Deliver ─────────────────────────────────
      await runValidateAndSubmit(
        {
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
          machineId: executeResult.machineId,
          timeoutHours,
          notifyMsgRef,
          notifyBlocks,
          notifyStateBlocks,
          inngest,
        },
        step,
      );
    },
  );
}
