import { createLogger } from '../lib/logger.js';
import { createPostgRESTClient, type PostgRESTClient } from './lib/postgrest-client.js';
import { resolveAgentsMd } from './lib/agents-md-resolver.mjs';

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
  agents_md?: string | null;
  delivery_instructions?: string | null;
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
  model: string,
): Promise<{ content: string; metadata: Record<string, unknown> }> {
  const fullPrompt = systemPrompt
    ? `${systemPrompt}\n\n${instructions}\n\nTask ID: ${TASK_ID}`
    : `${instructions}\n\nTask ID: ${TASK_ID}`;

  // Map model ID to OpenRouter provider format: "minimax/minimax-m2.7" → "openrouter/minimax/minimax-m2.7"
  const opencodeModel = model.startsWith('openrouter/') ? model : `openrouter/${model}`;

  log.info(
    { taskId: TASK_ID, model: opencodeModel },
    '[opencode-harness] Starting opencode run subprocess',
  );

  const { spawn } = await import('child_process');

  await new Promise<void>((resolve, reject) => {
    const args = ['run', '--model', opencodeModel, fullPrompt];
    const child = spawn('opencode', args, {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: '/app',
    });

    child.stdout?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        log.info({ taskId: TASK_ID }, `[opencode] ${line}`);
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        log.warn({ taskId: TASK_ID }, `[opencode:stderr] ${line}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        log.info({ taskId: TASK_ID }, '[opencode-harness] opencode run exited successfully');
        resolve();
      } else {
        reject(new Error(`[opencode-harness] opencode run exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`[opencode-harness] Failed to spawn opencode: ${err.message}`));
    });
  });

  // Read summary content and approval metadata written by the model
  let content = 'completed';
  let extraMetadata: Record<string, unknown> = {};

  try {
    const { readFile } = await import('fs/promises');
    const summaryText = await readFile('/tmp/summary.txt', 'utf8');
    if (summaryText.trim()) {
      content = summaryText.trim();
      log.info(
        { taskId: TASK_ID },
        '[opencode-harness] Read summary content from /tmp/summary.txt',
      );
    }
  } catch {
    // File not written — use default content
  }

  try {
    const { readFile } = await import('fs/promises');
    const approvalJson = await readFile('/tmp/approval-message.json', 'utf8');
    const approvalData = JSON.parse(approvalJson) as Record<string, unknown>;
    // Map post-message.js output keys to lifecycle-expected metadata keys
    extraMetadata = {
      ...approvalData,
      approval_message_ts: approvalData.ts,
      target_channel: approvalData.channel,
      ...(approvalData.conversationRef !== undefined && {
        conversation_ref: approvalData.conversationRef,
      }),
    };
    log.info(
      { taskId: TASK_ID },
      '[opencode-harness] Read approval metadata from /tmp/approval-message.json',
    );
  } catch {
    // File not written — no approval metadata
  }

  // Validate that the model actually produced content
  if (content === 'completed' && Object.keys(extraMetadata).length === 0) {
    throw new Error(
      '[opencode-harness] Model did not produce content — /tmp/summary.txt and /tmp/approval-message.json were not written. This is a model reliability issue; retry the task.',
    );
  }

  return {
    content,
    metadata: { ...extraMetadata },
  };
}

async function runDeliveryPhase(
  archetype: ArchetypeRow,
  taskId: string,
  logger: typeof log,
): Promise<void> {
  if (!archetype.delivery_instructions) {
    logger.info({ taskId }, 'Archetype missing delivery_instructions — marking Failed');
    await markFailed('Archetype missing delivery_instructions', null);
    return;
  }

  const rows = await db.get(
    'deliverables',
    `external_ref=eq.${taskId}&select=*&order=created_at.desc&limit=1`,
  );
  const deliverable = rows?.[0] as Record<string, unknown> | undefined;

  if (!deliverable) {
    logger.info({ taskId }, 'No deliverable found for task — marking Failed');
    await markFailed('No deliverable found for task', null);
    return;
  }

  const approvedContent = (deliverable.content as string) ?? '';
  const instructions = `APPROVED CONTENT TO DELIVER:\n${approvedContent}\n\n${archetype.delivery_instructions}`;

  logger.info({ taskId }, 'Starting delivery-phase OpenCode session');

  try {
    await runOpencodeSession(
      archetype.system_prompt ?? '',
      instructions,
      archetype.model ?? 'minimax/minimax-m2.7',
    );
  } catch (err) {
    logger.error({ taskId, err }, '[opencode-harness] Delivery-phase OpenCode session failed');
    await markFailed(err instanceof Error ? err.message : String(err), null);
    throw err;
  }

  await db.patch('tasks', `id=eq.${taskId}`, {
    status: 'Done',
    updated_at: new Date().toISOString(),
  });
  logger.info({ taskId }, 'Task status → Done');

  await db.post('status_transitions', {
    task_id: taskId,
    from_status: 'Delivering',
    to_status: 'Done',
    created_at: new Date().toISOString(),
  });
  logger.info({ taskId }, 'Status transition logged: Delivering → Done');
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

  const isDeliveryPhase = process.env.EMPLOYEE_PHASE === 'delivery';
  if (isDeliveryPhase) {
    await runDeliveryPhase(archetype, TASK_ID, log);
    return;
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

  try {
    let tenantConfig: Record<string, unknown> | null = null;
    if (task.tenant_id) {
      const tenantRows = await db.get('tenants', `id=eq.${task.tenant_id}&select=config`);
      tenantConfig = (tenantRows?.[0] as { config?: Record<string, unknown> })?.config ?? null;
    }
    const { readFile, writeFile } = await import('node:fs/promises');
    const platformContent = await readFile('/app/AGENTS.md', 'utf8');
    const agentsMdContent = resolveAgentsMd(platformContent, tenantConfig, archetype);
    await writeFile('/app/AGENTS.md', agentsMdContent, 'utf8');
    log.info('Wrote concatenated AGENTS.md (platform + tenant + archetype)');
  } catch (err) {
    log.warn('Failed to resolve dynamic AGENTS.md, using static platform default: %s', err);
  }

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
    external_ref: TASK_ID,
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
  process.exit(0);
}

main().catch((err) => {
  log.error({ taskId: TASK_ID, err }, '[opencode-harness] Unhandled error in main');
  process.exit(1);
});
