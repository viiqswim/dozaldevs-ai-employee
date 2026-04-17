/**
 * OpenCode worker harness entry point for non-engineering AI employees.
 *
 * Runs inside the Docker container via CMD override:
 *   ["node", "/app/dist/workers/opencode-harness.mjs"]
 *
 * Behavior is fully driven by the archetype config in the DB.
 * Zero hardcoded employee-specific logic — every decision comes from
 * the archetype's system_prompt, instructions, model, and deliverable_type.
 *
 * Boot sequence:
 *   1. Read TASK_ID from env
 *   2. Fetch task + archetype from PostgREST
 *   3. Create execution record
 *   4. Update task → Executing
 *   5. Start OpenCode session with system_prompt + instructions
 *   6. Monitor OpenCode session until completion
 *   7. Write deliverable record, fire Inngest event, update task → Submitting
 */

import { createLogger } from '../lib/logger.js';
import { createPostgRESTClient, type PostgRESTClient } from './lib/postgrest-client.js';

const log = createLogger('opencode-harness');

const TASK_ID: string = (() => {
  const id = process.env.TASK_ID;
  if (!id) {
    createLogger('opencode-harness').error(
      '[opencode-harness] TASK_ID environment variable is required — aborting',
    );
    process.exit(1);
  }
  return id;
})();

interface ArchetypeRow {
  id: string;
  role_name?: string | null;
  system_prompt?: string | null;
  instructions?: string | null;
  model?: string | null;
  deliverable_type?: string | null;
  runtime?: string | null;
}

interface TaskWithArchetype {
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

const db: PostgRESTClient = createPostgRESTClient();

process.on('SIGTERM', () => {
  log.warn({ taskId: TASK_ID }, '[opencode-harness] SIGTERM received — marking task Failed');
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

async function markFailed(reason: string, executionId: string | null): Promise<void> {
  try {
    await db.patch('tasks', `id=eq.${TASK_ID}`, {
      status: 'Failed',
      failure_reason: reason,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn({ err }, '[opencode-harness] Failed to PATCH task status to Failed');
  }

  if (executionId) {
    try {
      await db.patch('executions', `id=eq.${executionId}`, {
        status: 'failed',
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      log.warn({ err }, '[opencode-harness] Failed to PATCH execution status to failed');
    }
  }
}

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
      log.info({ taskId }, 'Inngest event fired: employee/task.completed');
    } else {
      log.warn(
        { taskId, httpStatus: response.status },
        '[opencode-harness] Inngest event returned non-OK status — watchdog will recover',
      );
    }
  } catch (err) {
    log.warn(
      { taskId, err },
      '[opencode-harness] Failed to fire Inngest completion event — watchdog will recover',
    );
  }
}

async function runOpencodeSession(
  systemPrompt: string,
  instructions: string,
  model: string,
): Promise<{ content: string; metadata: Record<string, unknown> }> {
  const { spawn } = await import('child_process');

  return new Promise((resolve, reject) => {
    const fullPrompt = `${instructions}\n\nTask ID: ${TASK_ID}`;

    const child = spawn(
      'opencode',
      ['run', '--model', model, '--system', systemPrompt, '--non-interactive', fullPrompt],
      {
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      if (code !== 0) {
        log.error(
          { code, stderr: stderr.slice(-2000) },
          '[opencode-harness] OpenCode exited with error',
        );
        reject(new Error(`OpenCode exited with code ${code}: ${stderr.slice(-500)}`));
        return;
      }

      log.info({ taskId: TASK_ID }, 'OpenCode session completed');
      resolve({
        content: stdout.trim(),
        metadata: {},
      });
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

async function main(): Promise<void> {
  log.info({ taskId: TASK_ID }, 'OpenCode harness starting');

  const rows = await db.get('tasks', `id=eq.${TASK_ID}&select=*,archetypes(*)`);
  if (!rows || rows.length === 0) {
    log.error({ taskId: TASK_ID }, '[opencode-harness] Task not found — aborting');
    process.exit(1);
  }
  const task = rows[0] as TaskWithArchetype;

  const archetypeRaw = task.archetypes;
  const archetype: ArchetypeRow | null = Array.isArray(archetypeRaw)
    ? (archetypeRaw[0] ?? null)
    : (archetypeRaw ?? null);

  if (!archetype) {
    log.error({ taskId: TASK_ID }, '[opencode-harness] Task has no archetype — aborting');
    process.exit(1);
  }

  const systemPrompt = archetype.system_prompt ?? '';
  const instructions = archetype.instructions ?? '';
  const model = archetype.model ?? 'minimax/minimax-m2.7';

  if (!instructions) {
    log.error(
      { taskId: TASK_ID, archetypeId: archetype.id },
      '[opencode-harness] Archetype has no instructions — aborting',
    );
    process.exit(1);
  }

  log.info(
    {
      taskId: TASK_ID,
      roleName: archetype.role_name,
      model,
      deliverableType: archetype.deliverable_type,
    },
    'Archetype loaded',
  );

  const executionId_seed = crypto.randomUUID();
  const executionRecord = await db.post('executions', {
    id: executionId_seed,
    task_id: TASK_ID,
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
      { taskId: TASK_ID },
      '[opencode-harness] Failed to create execution record — continuing without executionId',
    );
  } else {
    log.info({ taskId: TASK_ID, executionId }, 'Execution record created');
  }

  await db.patch('tasks', `id=eq.${TASK_ID}`, {
    status: 'Executing',
    updated_at: new Date().toISOString(),
  });
  log.info({ taskId: TASK_ID }, 'Task status → Executing');

  let content = '';
  let metadata: Record<string, unknown> = {};

  try {
    const result = await runOpencodeSession(systemPrompt, instructions, model);
    content = result.content;
    metadata = result.metadata;
  } catch (err) {
    log.error({ taskId: TASK_ID, err }, '[opencode-harness] OpenCode session failed');
    await markFailed(err instanceof Error ? err.message : String(err), executionId);
    process.exit(1);
  }

  const deliverableId = crypto.randomUUID();
  await db.post('deliverables', {
    id: deliverableId,
    execution_id: executionId ?? executionId_seed,
    delivery_type: archetype.deliverable_type ?? 'text',
    status: 'pending',
    content,
    metadata,
    updated_at: new Date().toISOString(),
  });

  log.info({ taskId: TASK_ID, deliverableId }, 'Deliverable record created');

  await db.patch('tasks', `id=eq.${TASK_ID}`, {
    status: 'Submitting',
    updated_at: new Date().toISOString(),
  });
  log.info({ taskId: TASK_ID }, 'Task status → Submitting');

  await fireCompletionEvent(TASK_ID);

  log.info({ taskId: TASK_ID }, 'OpenCode harness complete');
}

main().catch((err) => {
  log.error({ taskId: TASK_ID, err }, '[opencode-harness] Unhandled error in main');
  process.exit(1);
});
