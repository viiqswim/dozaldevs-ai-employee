/**
 * Delivery phase logic extracted from opencode-harness.mts.
 *
 * runDeliveryPhase() drives the delivery container's execution loop:
 * fetch approved deliverable, compile AGENTS.md, start OpenCode session,
 * verify delivery confirmation, and transition the task to Done.
 *
 * runOpencodeSession is injected as a parameter to avoid circular imports
 * (the session runner lives in the harness alongside the SIGTERM handler and
 * module-level server/heartbeat globals it manages).
 */

import { createLogger } from '../../lib/logger.js';
import { SUMMARY_PATH } from '../../lib/output-contract-constants.js';
import { type PostgRESTClient } from './postgrest-client.js';
import {
  compileAgentsMd,
  loadConnectedToolkits,
  loadCustomIntegrations,
} from './agents-md-compiler.mjs';
import { classifyFailure } from './failure-codes.js';
import { buildTemplateVars, substituteTemplateVars } from './template-vars.js';
import { assembleTaskPrompt } from './prompt-assembler.mjs';
import {
  markFailed,
  fireCompletionEvent,
  writeOpencodeAuth,
  filterComposioSkills,
  filterCustomSkills,
} from './harness-helpers.mjs';
import {
  type ArchetypeRow,
  type TaskWithArchetype,
  type RunOpencodeSessionFn,
} from './execution-phase.mjs';

const log = createLogger('opencode-harness');

const MIN_DELIVERY_SESSION_MS = 30_000;

// ---------------------------------------------------------------------------
// runDeliveryPhase
// ---------------------------------------------------------------------------

export async function runDeliveryPhase(
  task: TaskWithArchetype,
  archetype: ArchetypeRow,
  taskId: string,
  db: PostgRESTClient,
  runOpencodeSession: RunOpencodeSessionFn,
): Promise<void> {
  // 1. Fetch the approved deliverable content from DB
  const deliverableRows = await db.get(
    'deliverables',
    `external_ref=eq.${taskId}&select=*&order=created_at.desc&limit=1`,
  );
  const deliverable = deliverableRows?.[0] as Record<string, unknown> | undefined;
  if (!deliverable) {
    log.error({ taskId }, '[opencode-harness] No deliverable found for delivery phase');
    await markFailed(
      taskId,
      db,
      'No deliverable found for delivery phase',
      null,
      'Delivering',
      classifyFailure('No deliverable found for delivery phase'),
    );
    return;
  }
  const deliverableContent = (deliverable.content as string) ?? '';

  const deliveryExecutionId = crypto.randomUUID();
  let deliveryExecId: string | null = null;
  try {
    const deliveryExecRecord = await db.post('executions', {
      id: deliveryExecutionId,
      task_id: taskId,
      runtime_type: 'opencode',
      status: 'running',
      phase: 'delivery',
      updated_at: new Date().toISOString(),
    });
    deliveryExecId =
      deliveryExecRecord && typeof (deliveryExecRecord as { id?: unknown }).id === 'string'
        ? (deliveryExecRecord as { id: string }).id
        : deliveryExecutionId;
    log.info({ taskId, deliveryExecId }, '[opencode-harness] Delivery execution record created');
  } catch (err) {
    log.warn({ err }, '[opencode-harness] Failed to create delivery execution record — non-fatal');
    deliveryExecId = null;
  }

  // 3. Build delivery prompt with injected deliverable content — use assembleTaskPrompt for
  //    consistency with the execution phase (adds date/epoch prefix + Task ID suffix).
  const deliveryPrompt = assembleTaskPrompt({
    instructions: `Follow the instructions in <delivery-instructions> within the AGENTS.md file\n\n<approved-content>\n${deliverableContent}\n</approved-content>`,
    taskId,
  });

  // 4. Auth setup — required before OpenCode session
  await writeOpencodeAuth(archetype.temperature ?? 1.0);
  // Set phase for Composio audit rows
  process.env.TASK_PHASE = 'delivery';

  // Load active Composio toolkits for the tenant (empty when none connected —
  // the compiler then omits the Connected Apps section).
  const connectedToolkits = task.tenant_id ? await loadConnectedToolkits(task.tenant_id) : [];

  // Prune composio-* skill folders for apps this tenant has NOT connected.
  // MUST run before runOpencodeSession (OpenCode scans skills once at boot).
  filterComposioSkills(connectedToolkits);

  // Prune custom-integration skill folders (hostfully/sifely/github/slack) for
  // services this tenant has NOT connected. Same boot-time constraint as above.
  const connectedServices = task.tenant_id ? await loadCustomIntegrations(task.tenant_id) : [];
  filterCustomSkills(connectedServices);

  // 5. Compile AGENTS.md for delivery phase (same compiled doc, delivery prompt points to <delivery-instructions>)
  try {
    const { writeFile } = await import('node:fs/promises');
    const rawCompiledAgentsMd = compileAgentsMd({
      identity: archetype.identity ?? '',
      executionSteps: archetype.execution_steps ?? '',
      deliverySteps: archetype.delivery_steps ?? '',
      employeeRules: '',
      employeeKnowledge: '',
      platformRulesOverride: archetype.platform_rules_override ?? undefined,
      connectedToolkits,
      connectedServices,
    });
    // Resolve all declared-input placeholders ({{key}}) generically.
    // Same mechanism as execution phase — ensures delivery_steps with
    // {{key}} references also receive the actual runtime values.
    const templateVars = buildTemplateVars();
    const compiledAgentsMd = substituteTemplateVars(rawCompiledAgentsMd, templateVars);
    await writeFile('/app/AGENTS.md', compiledAgentsMd, 'utf8');
    log.info('[opencode-harness] Compiled AGENTS.md written for delivery phase');
  } catch (err) {
    log.warn(
      '[opencode-harness] Failed to compile delivery AGENTS.md, using static default: %s',
      err,
    );
  }

  // 6. Run the OpenCode delivery session
  if (!archetype.model) {
    log.error(
      { taskId },
      '[opencode-harness] Archetype has no model configured for delivery phase',
    );
    if (deliveryExecId) {
      await db
        .patch('executions', `id=eq.${deliveryExecId}`, {
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .catch((err) => {
          log.warn({ taskId, err }, 'Failed to mark execution failed (non-fatal)');
        });
    }
    await markFailed(
      taskId,
      db,
      'Archetype has no model configured',
      null,
      'Delivering',
      'missing_model',
    );
    return;
  }
  let deliveryResult: Awaited<ReturnType<RunOpencodeSessionFn>> | null = null;
  try {
    deliveryResult = await runOpencodeSession(
      deliveryPrompt,
      archetype.model,
      'tsx /tools/platform/submit-output.ts --summary "<one sentence describing what you accomplished>" --classification "NO_ACTION_NEEDED"',
      { minElapsedMs: MIN_DELIVERY_SESSION_MS },
    );
  } catch (err) {
    log.error({ taskId, err }, '[opencode-harness] Delivery OpenCode session failed');
    const deliveryErr = err instanceof Error ? err.message : String(err);
    if (deliveryExecId) {
      await db
        .patch('executions', `id=eq.${deliveryExecId}`, {
          status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .catch((err) => {
          log.warn({ taskId, err }, 'Failed to mark execution failed (non-fatal)');
        });
    }
    await markFailed(taskId, db, deliveryErr, null, 'Delivering', classifyFailure(deliveryErr));
    return;
  }

  if (deliveryExecId && deliveryResult) {
    try {
      const usage = deliveryResult.tokenUsage;
      await db.patch('executions', `id=eq.${deliveryExecId}`, {
        status: 'completed',
        prompt_tokens: usage.promptTokens,
        completion_tokens: usage.completionTokens,
        estimated_cost_usd: usage.estimatedCostUsd,
        updated_at: new Date().toISOString(),
      });
      log.info(
        { taskId, deliveryExecId, ...usage },
        '[opencode-harness] Delivery execution metrics persisted',
      );
    } catch (err) {
      log.warn(
        { err },
        '[opencode-harness] Failed to persist delivery execution metrics — non-fatal',
      );
    }
  }

  // 7. Verify delivery confirmation from SUMMARY_PATH
  {
    const { readFile: deliveryReadFile } = await import('fs/promises');
    let summaryRaw: string;
    try {
      summaryRaw = await deliveryReadFile(SUMMARY_PATH, 'utf8');
    } catch {
      await markFailed(
        taskId,
        db,
        'Delivery not confirmed — no summary.txt produced',
        null,
        'Delivering',
        classifyFailure('Delivery not confirmed — no summary.txt produced'),
      );
      return;
    }
    let deliverySummary: Record<string, unknown>;
    try {
      deliverySummary = JSON.parse(summaryRaw) as Record<string, unknown>;
    } catch {
      await markFailed(
        taskId,
        db,
        'Delivery not confirmed — summary.txt is not valid JSON',
        null,
        'Delivering',
        classifyFailure('Delivery not confirmed — summary.txt is not valid JSON'),
      );
      return;
    }
    if (deliverySummary.delivered !== true && !deliverySummary.summary) {
      await markFailed(
        taskId,
        db,
        'Delivery not confirmed — summary.txt missing both delivered:true and summary field',
        null,
        'Delivering',
        classifyFailure(
          'Delivery not confirmed — summary.txt missing both delivered:true and summary field',
        ),
      );
      return;
    }
    log.info({ taskId }, '[opencode-harness] Delivery confirmed via summary.txt');
  }

  // 8. Mark task Done
  await db.patch('tasks', `id=eq.${taskId}`, {
    status: 'Done',
    updated_at: new Date().toISOString(),
  });
  try {
    await db.post('task_status_log', {
      task_id: taskId,
      from_status: 'Delivering',
      to_status: 'Done',
      actor: 'machine',
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn({ err }, '[opencode-harness] Failed to log Delivering→Done transition (non-fatal)');
  }
  log.info({ taskId }, '[opencode-harness] Delivery phase complete — task Done');
  await fireCompletionEvent(taskId);
  process.exit(0);
}
