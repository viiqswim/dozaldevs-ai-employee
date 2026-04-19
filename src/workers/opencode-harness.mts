import { createLogger } from '../lib/logger.js';
import { createPostgRESTClient, type PostgRESTClient } from './lib/postgrest-client.js';
import { startOpencodeServer } from './lib/opencode-server.js';
import { createSessionManager } from './lib/session-manager.js';

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

// Module-level server handle so SIGTERM handler can kill it
let serverHandleGlobal: { kill: () => Promise<void> } | null = null;

process.on('SIGTERM', () => {
  log.warn({ taskId: TASK_ID }, '[opencode-harness] SIGTERM received — marking task Failed');
  void serverHandleGlobal?.kill();
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

async function writeOpencodeAuth(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    log.warn('[opencode-harness] OPENROUTER_API_KEY not set — OpenCode may fail to authenticate');
    return;
  }
  const { mkdir, writeFile } = await import('fs/promises');
  const { homedir } = await import('os');
  const { join } = await import('path');
  const authDir = join(homedir(), '.local', 'share', 'opencode');
  await mkdir(authDir, { recursive: true });
  const authJson = JSON.stringify({ openrouter: { type: 'api', key: apiKey } }, null, 2);
  await writeFile(join(authDir, 'auth.json'), authJson, 'utf8');
  log.info('[opencode-harness] OpenRouter auth.json written');

  const configDir = join(process.cwd(), '.opencode');
  await mkdir(configDir, { recursive: true });
  const configJson = JSON.stringify({ permission: { '*': 'allow', question: 'deny' } }, null, 2);
  await writeFile(join(configDir, 'opencode.json'), configJson, 'utf8');
  log.info('[opencode-harness] opencode.json permission config written');
}

async function runOpencodeSession(
  systemPrompt: string,
  instructions: string,
  _model: string,
): Promise<{ content: string; metadata: Record<string, unknown> }> {
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n${instructions}\n\nTask ID: ${TASK_ID}`
    : `${instructions}\n\nTask ID: ${TASK_ID}`;

  // Start OpenCode server (same pattern as engineering employee in orchestrate.mts)
  const serverHandle = await startOpencodeServer({
    port: 4096,
    cwd: '/app',
    healthTimeoutMs: 60000,
  });

  if (serverHandle === null) {
    throw new Error('[opencode-harness] Failed to start OpenCode server');
  }

  serverHandleGlobal = serverHandle;

  try {
    // Configure OpenRouter via REST API (belt-and-suspenders alongside auth.json)
    if (process.env.OPENROUTER_API_KEY) {
      try {
        await fetch(`${serverHandle.url}/auth/openrouter`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'api', key: process.env.OPENROUTER_API_KEY }),
        });
        log.info('[opencode-harness] OpenRouter provider configured via REST API');
      } catch (err) {
        log.warn(
          { err },
          '[opencode-harness] Failed to configure OpenRouter via REST API — auth.json fallback',
        );
      }
    }

    const sessionManager = createSessionManager(serverHandle.url);

    const sessionId = await sessionManager.createSession('daily-summarizer');
    if (sessionId === null) {
      throw new Error('[opencode-harness] Failed to create OpenCode session');
    }

    log.info({ taskId: TASK_ID, sessionId }, 'OpenCode session created — injecting prompt');

    await sessionManager.injectTaskPrompt(sessionId, fullPrompt);

    log.info({ taskId: TASK_ID, sessionId }, 'Prompt injected — monitoring for completion');

    const monitorResult = await sessionManager.monitorSession(sessionId, {
      timeoutMs: 10 * 60 * 1000, // 10 minutes — summarizer is quick
      minElapsedMs: 60000, // 60s minimum — give model time to use bash tools
    });

    if (!monitorResult.completed) {
      throw new Error(
        `[opencode-harness] OpenCode session did not complete: ${monitorResult.reason ?? 'unknown'}`,
      );
    }

    log.info(
      { taskId: TASK_ID, sessionId, reason: monitorResult.reason },
      'OpenCode session completed successfully',
    );

    return {
      content: monitorResult.reason ?? 'completed',
      metadata: { sessionId },
    };
  } finally {
    serverHandleGlobal = null;
    await serverHandle.kill();
    log.info('[opencode-harness] OpenCode server stopped');
  }
}

async function main(): Promise<void> {
  // Set bash tool timeout (same as entrypoint.sh) — prevents tool calls from timing out
  process.env.OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS ??= '1200000';

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

  const feedbackContext = process.env.FEEDBACK_CONTEXT ?? '';
  const baseSystemPrompt = archetype.system_prompt ?? '';
  const systemPrompt = feedbackContext
    ? `${baseSystemPrompt}\n\n${feedbackContext}`
    : baseSystemPrompt;
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

  await writeOpencodeAuth();

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
  // Force exit — the SSE stream from session-manager keeps the event loop alive
  process.exit(0);
}

main().catch((err) => {
  log.error({ taskId: TASK_ID, err }, '[opencode-harness] Unhandled error in main');
  process.exit(1);
});
