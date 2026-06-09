import type { Inngest } from 'inngest';
import type { InngestStep } from '../../events.js';
import { createLogger } from '../../../lib/logger.js';
import { patchTask, logStatusTransition } from '../../lib/lifecycle-helpers.js';
import type { NotifyBlocksOpts, NotifyRef } from './triage-and-ready.js';
import type { KnownBlock } from '@slack/web-api';
import { runNoApprovalPath } from './no-approval-path.js';
import { runOverrideCardPath } from './override-card.js';
import { runReviewingPath } from './reviewing-path.js';

const log = createLogger('lifecycle-validate-and-submit');

export interface ValidateContext {
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
  machineId: string;
  timeoutHours: number;
  notifyMsgRef: NotifyRef | null;
  notifyBlocks: (opts: NotifyBlocksOpts) => KnownBlock[];
  notifyStateBlocks: (opts: { emoji: string; text: string }) => KnownBlock[];
  inngest: Inngest;
}

export async function runValidateAndSubmit(ctx: ValidateContext, step: InngestStep): Promise<void> {
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
    machineId,
    timeoutHours,
    notifyMsgRef,
    notifyBlocks,
    notifyStateBlocks,
    inngest,
  } = ctx;

  await step.run('validating', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'Validating' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'Validating', 'Submitting');
    log.info({ taskId }, 'State: Validating (auto-pass)');
  });
  log.info({ taskId, runId, step: 'validating' }, 'Step complete: validating');

  await step.run('submitting', async () => {
    await patchTask(supabaseUrl, headers, taskId, { status: 'Submitting' });
    await logStatusTransition(supabaseUrl, headers, taskId, 'Submitting', 'Validating');
    log.info({ taskId }, 'State: Submitting');
  });
  log.info({ taskId, runId, step: 'submitting' }, 'Step complete: submitting');

  if (!approvalRequired) {
    await runNoApprovalPath(
      {
        taskId,
        archetypeId,
        tenantId,
        supabaseUrl,
        supabaseKey,
        headers,
        taskData,
        archetype,
        machineId,
        notifyMsgRef,
        notifyBlocks,
        notifyStateBlocks,
      },
      step,
    );
    return;
  }

  const overrideHandled = await runOverrideCardPath(
    {
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
    },
    step,
  );

  if (overrideHandled) {
    return;
  }

  await runReviewingPath(
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
      machineId,
      timeoutHours,
      notifyMsgRef,
      notifyBlocks,
      notifyStateBlocks,
      inngest,
    },
    step,
  );
}
