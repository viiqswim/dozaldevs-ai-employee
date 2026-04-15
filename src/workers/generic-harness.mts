/**
 * Generic worker harness entry point for non-engineering AI employees.
 *
 * Runs inside the Docker container via CMD override:
 *   ["node", "/app/dist/workers/generic-harness.mjs"]
 *
 * Behavior is fully driven by the archetype config in the DB.
 * Zero hardcoded employee-specific logic — every decision comes from
 * the archetype's steps array, tool names, and deliverable_type.
 *
 * Boot sequence:
 *   1. Read TASK_ID from env
 *   2. Fetch task + archetype from PostgREST
 *   3. Create execution record
 *   4. Update task → Executing
 *   5. Execute archetype steps in order via TOOL_REGISTRY
 *   6. Write deliverable, fire Inngest event, update task → Submitting
 */

import { createLogger } from '../lib/logger.js';
import { createPostgRESTClient, type PostgRESTClient } from './lib/postgrest-client.js';
import { TOOL_REGISTRY } from './tools/registry.js';
import { resolveParams } from './tools/param-resolver.js';
import type { ToolContext, StepDefinition } from './tools/types.js';

// ---------------------------------------------------------------------------
// Bootstrap: require TASK_ID before anything else
// ---------------------------------------------------------------------------

const log = createLogger('generic-harness');

/**
 * TASK_ID is guaranteed to be a string at module load — process exits immediately
 * if the env var is missing, so all downstream code can treat it as string.
 */
const TASK_ID: string = (() => {
  const id = process.env.TASK_ID;
  if (!id) {
    createLogger('generic-harness').error(
      '[generic-harness] TASK_ID environment variable is required — aborting',
    );
    process.exit(1);
  }
  return id;
})();

// ---------------------------------------------------------------------------
// Types for PostgREST responses
// ---------------------------------------------------------------------------

interface ArchetypeRow {
  id: string;
  role_name?: string | null;
  steps?: unknown;
  deliverable_type?: string | null;
  system_prompt?: string | null;
  model?: string | null;
}

interface TaskWithArchetype {
  id: string;
  status: string;
  archetype_id?: string | null;
  archetypes?: ArchetypeRow | ArchetypeRow[] | null;
  [key: string]: unknown;
}

interface ExecutionRow {
  id: string;
}

// ---------------------------------------------------------------------------
// PostgREST client (module-level so SIGTERM handler can reach it)
// ---------------------------------------------------------------------------

const db: PostgRESTClient = createPostgRESTClient();

// ---------------------------------------------------------------------------
// SIGTERM handler — mark task Failed before the container is killed
// ---------------------------------------------------------------------------

process.on('SIGTERM', () => {
  log.warn({ taskId: TASK_ID }, '[generic-harness] SIGTERM received — marking task Failed');
  void db
    .patch('tasks', `id=eq.${TASK_ID}`, {
      status: 'Failed',
      failure_reason: 'Worker terminated',
      updated_at: new Date().toISOString(),
    })
    .finally(() => {
      process.exit(1);
    });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function markFailed(reason: string, executionId: string | null): Promise<void> {
  try {
    await db.patch('tasks', `id=eq.${TASK_ID}`, {
      status: 'Failed',
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn({ err }, '[generic-harness] Failed to PATCH task status to Failed');
  }

  if (executionId) {
    try {
      await db.patch('executions', `id=eq.${executionId}`, {
        status: 'failed',
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      log.warn({ err }, '[generic-harness] Failed to PATCH execution status to failed');
    }
  }
}

/**
 * Walk step results and return the text from the first llm.generate result
 * (identified by the presence of a `.text` string field).
 * Falls back to JSON-stringifying the last step result.
 */
function extractContent(stepResults: unknown[]): string {
  for (const result of stepResults) {
    if (result !== null && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      if (typeof r.text === 'string') {
        return r.text;
      }
    }
  }
  const last = stepResults[stepResults.length - 1];
  if (last === undefined) return '';
  return JSON.stringify(last);
}

/**
 * If the last step result looks like a slack.postMessage result
 * ({ ts, channel }), return approval metadata; otherwise null.
 */
function extractMetadata(lastResult: unknown): Record<string, unknown> | null {
  if (lastResult !== null && typeof lastResult === 'object') {
    const r = lastResult as Record<string, unknown>;
    if (typeof r.ts === 'string' && typeof r.channel === 'string') {
      return {
        approval_message_ts: r.ts,
        target_channel: r.channel,
        blocks: null,
      };
    }
  }
  return null;
}

/** Fire the generic employee/task.completed Inngest event. Never throws. */
async function fireCompletionEvent(taskId: string): Promise<void> {
  const baseUrl = process.env.INNGEST_BASE_URL ?? 'http://localhost:8288';
  const eventKey = process.env.INNGEST_EVENT_KEY ?? 'local';
  const url = `${baseUrl}/e/${eventKey}`;

  const payload = {
    name: 'employee/task.completed',
    id: `employee-complete-${taskId}`,
    data: { taskId },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      log.info({ taskId }, '📡 Inngest event fired: employee/task.completed');
    } else {
      log.warn(
        { taskId, httpStatus: response.status },
        '[generic-harness] Inngest event returned non-OK status — watchdog will recover',
      );
    }
  } catch (err) {
    log.warn(
      { taskId, err },
      '[generic-harness] Failed to fire Inngest completion event — watchdog will recover',
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log.info({ taskId: TASK_ID }, '🚀 Generic harness starting');

  // ── Step 1: Fetch task with archetype join ─────────────────────────────
  const rows = await db.get('tasks', `id=eq.${TASK_ID}&select=*,archetypes(*)`);
  if (!rows || rows.length === 0) {
    log.error({ taskId: TASK_ID }, '[generic-harness] Task not found — aborting');
    process.exit(1);
  }
  const task = rows[0] as TaskWithArchetype;

  // ── Step 2: Extract archetype (PostgREST embeds as object or array) ────
  const archetypeRaw = task.archetypes;
  const archetype: ArchetypeRow | null = Array.isArray(archetypeRaw)
    ? (archetypeRaw[0] ?? null)
    : (archetypeRaw ?? null);

  if (!archetype) {
    log.error({ taskId: TASK_ID }, '[generic-harness] Task has no archetype — aborting');
    process.exit(1);
  }

  const steps = archetype.steps;
  if (!Array.isArray(steps) || steps.length === 0) {
    log.error(
      { taskId: TASK_ID, archetypeId: archetype.id },
      '[generic-harness] Archetype has no steps — aborting',
    );
    process.exit(1);
  }

  const typedSteps = steps as StepDefinition[];

  log.info(
    {
      taskId: TASK_ID,
      roleName: archetype.role_name,
      stepCount: typedSteps.length,
      deliverableType: archetype.deliverable_type,
    },
    '📋 Archetype loaded',
  );

  // ── Step 3: Create execution record ───────────────────────────────────
  const executionRecord = await db.post('executions', {
    task_id: TASK_ID,
    runtime_type: 'generic-harness',
    status: 'running',
  });
  const executionId: string | null =
    executionRecord && typeof (executionRecord as ExecutionRow).id === 'string'
      ? (executionRecord as ExecutionRow).id
      : null;

  if (!executionId) {
    log.warn(
      { taskId: TASK_ID },
      '[generic-harness] Failed to create execution record — continuing without executionId',
    );
  } else {
    log.info({ taskId: TASK_ID, executionId }, '📁 Execution record created');
  }

  // ── Step 4: Update task status → Executing ────────────────────────────
  await db.patch('tasks', `id=eq.${TASK_ID}`, {
    status: 'Executing',
    updated_at: new Date().toISOString(),
  });
  log.info({ taskId: TASK_ID }, '▶️  Task status → Executing');

  // ── Step 5: Execute archetype steps in order ───────────────────────────
  const stepResults: unknown[] = [];
  let previousResult: unknown = undefined;

  for (let i = 0; i < typedSteps.length; i++) {
    const step = typedSteps[i];
    const stepStart = Date.now();

    log.info(
      { taskId: TASK_ID, stepIndex: i, tool: step.tool },
      `🔧 Step ${i + 1}/${typedSteps.length}: ${step.tool}`,
    );

    const tool = TOOL_REGISTRY[step.tool];
    if (!tool) {
      const reason = `Tool not found in registry: ${step.tool}`;
      log.error({ taskId: TASK_ID, stepIndex: i, tool: step.tool }, `[generic-harness] ${reason}`);
      await markFailed(reason, executionId);
      process.exit(1);
    }

    const archetypeFields: Record<string, unknown> = {
      system_prompt: archetype.system_prompt ?? '',
      model: archetype.model ?? '',
      role_name: archetype.role_name ?? '',
      deliverable_type: archetype.deliverable_type ?? '',
    };
    const resolvedParams = resolveParams(
      step.params,
      process.env as Record<string, string>,
      previousResult,
      archetypeFields,
    );

    const ctx: ToolContext = {
      taskId: TASK_ID,
      env: process.env as Record<string, string>,
      logger: log,
      previousResult,
    };

    try {
      const result = await tool.execute(resolvedParams, ctx);
      const durationMs = Date.now() - stepStart;
      log.info(
        { taskId: TASK_ID, stepIndex: i, tool: step.tool, durationMs },
        `✅ Step ${i + 1} completed (${durationMs}ms)`,
      );
      stepResults.push(result);
      previousResult = result;
    } catch (err) {
      const durationMs = Date.now() - stepStart;
      const reason = err instanceof Error ? err.message : String(err);
      log.error(
        { taskId: TASK_ID, stepIndex: i, tool: step.tool, durationMs, err },
        `❌ Step ${i + 1} failed: ${reason}`,
      );
      await markFailed(reason, executionId);
      process.exit(1);
    }
  }

  // ── Step 6: All steps complete — update task → Submitting ─────────────
  await db.patch('tasks', `id=eq.${TASK_ID}`, {
    status: 'Submitting',
    updated_at: new Date().toISOString(),
  });
  log.info({ taskId: TASK_ID }, '📤 Task status → Submitting');

  // ── Step 7: Write deliverable record ──────────────────────────────────
  const content = extractContent(stepResults);
  const lastResult = stepResults[stepResults.length - 1];
  const metadata = extractMetadata(lastResult);

  if (executionId) {
    await db.post('deliverables', {
      execution_id: executionId,
      external_ref: TASK_ID,
      delivery_type: archetype.deliverable_type ?? 'generic',
      status: 'submitted',
      content,
      ...(metadata !== null ? { metadata } : {}),
    });
    log.info(
      { taskId: TASK_ID, executionId, deliverableType: archetype.deliverable_type },
      '📦 Deliverable written',
    );
  } else {
    log.warn({ taskId: TASK_ID }, '[generic-harness] No executionId — skipping deliverable write');
  }

  // ── Step 8: Fire Inngest completion event ─────────────────────────────
  await fireCompletionEvent(TASK_ID);

  // ── Step 9: Update execution → completed ──────────────────────────────
  if (executionId) {
    await db.patch('executions', `id=eq.${executionId}`, {
      status: 'completed',
      updated_at: new Date().toISOString(),
    });
    log.info({ taskId: TASK_ID, executionId }, '🏁 Execution marked completed');
  }

  log.info({ taskId: TASK_ID }, '✅ Generic harness finished successfully');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Auto-run outside test environments
// ---------------------------------------------------------------------------

if (!process.env.VITEST) {
  main().catch((err: unknown) => {
    log.error(
      { err },
      `[generic-harness] Unhandled error: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  });
}
