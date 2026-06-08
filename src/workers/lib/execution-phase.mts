/**
 * Execution phase logic extracted from opencode-harness.mts.
 *
 * runExecutionPhase() drives the worker's main execution loop:
 * compile AGENTS.md, start OpenCode session, persist metrics, write deliverable,
 * and transition the task to Submitting.
 *
 * runOpencodeSession is injected as a parameter to avoid circular imports
 * (the session runner lives in the harness alongside the SIGTERM handler and
 * module-level server/heartbeat globals it manages).
 */

import { createLogger } from '../../lib/logger.js';
import { type PostgRESTClient } from './postgrest-client.js';
import { compileAgentsMd } from './agents-md-compiler.mjs';
import { classifyFailure } from './failure-codes.js';
import { buildTemplateVars, substituteTemplateVars } from './template-vars.js';
import { assembleTaskPrompt } from './prompt-assembler.mjs';
import { injectAssignmentSection } from './trigger-payload.mjs';
import { markFailed, fireCompletionEvent, writeOpencodeAuth } from './harness-helpers.mjs';
import { startHeartbeat, type HeartbeatHandle } from './heartbeat.js';

const log = createLogger('opencode-harness');

// ---------------------------------------------------------------------------
// Types (mirrored from harness — kept local to avoid a shared-types module)
// ---------------------------------------------------------------------------

export interface ArchetypeRow {
  id: string;
  role_name?: string | null;
  instructions?: string | null;
  execution_instructions?: string | null;
  identity?: string | null;
  execution_steps?: string | null;
  delivery_steps?: string | null;
  temperature?: number | null;
  model?: string | null;
  deliverable_type?: string | null;
  runtime?: string | null;
  delivery_instructions?: string | null;
  enrichment_adapter?: string | null;
  risk_model?: { approval_required?: boolean; timeout_hours?: number } | null;
  tool_registry?: { tools?: string[] } | null;
  platform_rules_override?: string | null;
}

export interface TaskWithArchetype {
  id: string;
  status: string;
  tenant_id?: string | null;
  archetype_id?: string | null;
  archetypes?: ArchetypeRow | ArchetypeRow[] | null;
  [key: string]: unknown;
}

interface ExecutionRow {
  id: string;
}

export type RunOpencodeSessionFn = (
  instructions: string,
  model: string,
  submitOutputCmd: string,
  options?: { minElapsedMs?: number },
) => Promise<{
  content: string;
  metadata: Record<string, unknown>;
  sessionId: string | null;
  transcript: unknown[] | null;
  tokenUsage: { promptTokens: number; completionTokens: number; estimatedCostUsd: number };
}>;

// ---------------------------------------------------------------------------
// runExecutionPhase
// ---------------------------------------------------------------------------

export async function runExecutionPhase(
  task: TaskWithArchetype,
  archetype: ArchetypeRow,
  taskId: string,
  db: PostgRESTClient,
  runOpencodeSession: RunOpencodeSessionFn,
  onHeartbeatStarted?: (handle: HeartbeatHandle) => void,
  onHeartbeatStopped?: () => void,
): Promise<void> {
  const employeeRules = process.env.EMPLOYEE_RULES ?? '';
  const employeeKnowledge = process.env.EMPLOYEE_KNOWLEDGE ?? '';
  const overrideDirection = process.env.OVERRIDE_DIRECTION ?? '';
  // Platform constant execution prompt — points employee to XML tag in compiled AGENTS.md
  const EXECUTION_PROMPT =
    'Follow the instructions in <execution-instructions> within the AGENTS.md file';
  const instructions = overrideDirection
    ? `OVERRIDE DIRECTION FROM HUMAN:\n${overrideDirection}\n\n---\n${EXECUTION_PROMPT}`
    : EXECUTION_PROMPT;
  if (!archetype.model) {
    log.error({ taskId }, '[opencode-harness] Archetype has no model configured — cannot proceed');
    await markFailed(
      taskId,
      db,
      'Archetype has no model configured. Set a model in the employee settings before triggering.',
      null,
      'Executing',
      'missing_model',
    );
    process.exit(1);
  }
  const model = archetype.model;

  if (!archetype.identity && !archetype.execution_steps) {
    log.warn(
      { taskId, archetypeId: archetype.id },
      '[opencode-harness] Archetype has no identity or execution_steps — AGENTS.md may be incomplete',
    );
  }

  // Build template variable map from process.env (INPUT_* + worker_env) and apply substitution
  const templateVars = buildTemplateVars();
  const resolvedInstructions = substituteTemplateVars(instructions, templateVars);

  log.info(
    {
      taskId,
      roleName: archetype.role_name,
      model,
      deliverableType: archetype.deliverable_type,
    },
    'Archetype loaded',
  );

  const executionId_seed = crypto.randomUUID();
  const executionRecord = await db.post('executions', {
    id: executionId_seed,
    task_id: taskId,
    runtime_type: 'opencode',
    status: 'running',
    updated_at: new Date().toISOString(),
  });
  const executionId: string | null =
    executionRecord && typeof (executionRecord as ExecutionRow).id === 'string'
      ? (executionRecord as ExecutionRow).id
      : null;

  if (!executionId) {
    log.warn(
      { taskId },
      '[opencode-harness] Failed to create execution record — continuing without executionId',
    );
  } else {
    log.info({ taskId, executionId }, 'Execution record created');
  }

  // Start heartbeat after execution record creation
  let heartbeatHandle: HeartbeatHandle | null = null;
  if (executionId) {
    heartbeatHandle = startHeartbeat({ executionId, postgrestClient: db });
    onHeartbeatStarted?.(heartbeatHandle);
    log.info({ taskId, executionId }, '[opencode-harness] Heartbeat started');
  }

  await db.patch('tasks', `id=eq.${taskId}`, {
    status: 'Executing',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  log.info({ taskId }, 'Task status → Executing');

  await writeOpencodeAuth(archetype.temperature ?? 1.0);

  // Platform procedures — auto-generated from risk_model (still needed for submitOutputCmd)
  const approvalRequired =
    (archetype.risk_model as { approval_required?: boolean } | null)?.approval_required ?? true;

  // Compile AGENTS.md using template compiler
  try {
    const { writeFile } = await import('node:fs/promises');
    const compiledAgentsMd = compileAgentsMd({
      identity: archetype.identity ?? '',
      executionSteps: archetype.execution_steps ?? '',
      deliverySteps: archetype.delivery_steps ?? archetype.delivery_instructions ?? '',
      employeeRules,
      employeeKnowledge,
      platformRulesOverride: archetype.platform_rules_override ?? undefined,
    });
    await writeFile('/app/AGENTS.md', compiledAgentsMd, 'utf8');
    log.info('[opencode-harness] Compiled AGENTS.md written (template compiler)');

    // Save compiled snapshot to task for debugging
    try {
      await db.patch('tasks', `id=eq.${taskId}`, {
        compiled_agents_md: compiledAgentsMd,
        updated_at: new Date().toISOString(),
      });
      log.info('[opencode-harness] compiled_agents_md snapshot saved to task');
    } catch (patchErr) {
      log.warn(
        { patchErr },
        '[opencode-harness] Failed to save compiled_agents_md snapshot (non-fatal)',
      );
    }
  } catch (err) {
    log.warn(
      '[opencode-harness] Failed to compile AGENTS.md, using static platform default: %s',
      err,
    );
  }

  let content = '';
  let metadata: Record<string, unknown> = {};
  let sessionTranscript: unknown[] | null = null;
  let sessionTokenUsage = { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 };

  const rawEvent = task.raw_event as Record<string, unknown> | null | undefined;
  const triggerPayload =
    rawEvent && typeof rawEvent === 'object' && 'inputs' in rawEvent ? rawEvent.inputs : rawEvent;
  const finalInstructions = injectAssignmentSection(resolvedInstructions, triggerPayload);
  if (finalInstructions !== resolvedInstructions) {
    log.info(
      { taskId },
      '[opencode-harness] raw_event.inputs.prompt injected as ## Your Assignment',
    );
  }

  // Platform-level submit-output reminder appended to every employee's task prompt.
  // Placed at the end to leverage recency effect — last thing the model reads before generating.
  const taskPrompt = assembleTaskPrompt({
    instructions: finalInstructions,
    taskId,
  });
  const submitOutputCmd = `tsx /tools/platform/submit-output.ts --summary "<one sentence describing what you accomplished>" --classification "${approvalRequired ? 'NEEDS_APPROVAL' : 'NO_ACTION_NEEDED'}"`;

  try {
    const result = await runOpencodeSession(taskPrompt, model, submitOutputCmd, {
      minElapsedMs: 60_000,
    });
    content = result.content;
    metadata = result.metadata;
    sessionTranscript = result.transcript;
    sessionTokenUsage = result.tokenUsage;
  } catch (err) {
    log.error({ taskId, err }, '[opencode-harness] OpenCode session failed');
    const failureReason = err instanceof Error ? err.message : String(err);
    await markFailed(
      taskId,
      db,
      failureReason,
      executionId,
      'Executing',
      classifyFailure(failureReason),
    );
    process.exit(1);
  }

  // Stop heartbeat now that session is done
  if (heartbeatHandle !== null) {
    heartbeatHandle.stop();
    heartbeatHandle = null;
    onHeartbeatStopped?.();
  }

  // Patch execution with metrics and transcript (best-effort — never fail task over telemetry)
  if (executionId) {
    try {
      await db.patch('executions', `id=eq.${executionId}`, {
        status: 'completed',
        prompt_tokens: sessionTokenUsage.promptTokens,
        completion_tokens: sessionTokenUsage.completionTokens,
        estimated_cost_usd: sessionTokenUsage.estimatedCostUsd,
        session_transcript: sessionTranscript,
        updated_at: new Date().toISOString(),
      });
      log.info(
        { taskId, executionId, ...sessionTokenUsage },
        '[opencode-harness] Execution metrics persisted',
      );
    } catch (err) {
      log.warn({ err }, '[opencode-harness] Failed to persist execution metrics — non-fatal');
    }
  }

  // Set completed_at on task
  try {
    await db.patch('tasks', `id=eq.${taskId}`, {
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn({ err }, '[opencode-harness] Failed to set completed_at — non-fatal');
  }

  const deliverableId = crypto.randomUUID();
  await db.post('deliverables', {
    id: deliverableId,
    execution_id: executionId ?? executionId_seed,
    external_ref: taskId,
    delivery_type: archetype.deliverable_type ?? 'text',
    status: 'pending',
    content,
    metadata,
    updated_at: new Date().toISOString(),
  });

  log.info({ taskId, deliverableId }, 'Deliverable record created');

  await db.patch('tasks', `id=eq.${taskId}`, {
    status: 'Submitting',
    updated_at: new Date().toISOString(),
  });
  log.info({ taskId }, 'Task status → Submitting');

  await fireCompletionEvent(taskId);

  log.info({ taskId }, 'OpenCode harness complete');
  process.exit(0);
}
