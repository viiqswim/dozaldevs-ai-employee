import { createLogger } from '../lib/logger.js';
import { createPostgRESTClient, type PostgRESTClient } from './lib/postgrest-client.js';
import { startOpencodeServer } from './lib/opencode-server.js';
import { createSessionManager, extractUsage } from './lib/session-manager.js';
import { type HeartbeatHandle } from './lib/heartbeat.js';
import { applyResourceCaps } from './lib/resource-caps.js';
import { getPlatformSetting } from '../lib/platform-settings.js';
import { checkOutputFiles, readOutputContract } from './lib/output-contract.mjs';
import { resolveModelProvider } from './lib/model-provider.mjs';
import { tryAutoPostApprovalCard } from './lib/harness-helpers.mjs';
import { runExecutionPhase } from './lib/execution-phase.mjs';
import { runDeliveryPhase } from './lib/delivery-phase.mjs';

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

const db: PostgRESTClient = createPostgRESTClient();

type ServerHandle = { kill: () => Promise<void> };
let serverHandleGlobal: ServerHandle | null = null;
let heartbeatHandleGlobal: HeartbeatHandle | null = null;

process.on('SIGTERM', () => {
  log.warn({ taskId: TASK_ID }, '[opencode-harness] SIGTERM received — marking task Failed');
  if (heartbeatHandleGlobal !== null) (heartbeatHandleGlobal as HeartbeatHandle).stop();
  if (serverHandleGlobal !== null) void (serverHandleGlobal as ServerHandle).kill();
  void db
    .patch('tasks', `id=eq.${TASK_ID}`, {
      status: 'Failed',
      failure_reason: 'Worker terminated',
      failure_code: 'worker_terminated',
      updated_at: new Date().toISOString(),
    })
    .finally(() => {
      process.exit(1);
    });
});

async function runOpencodeSession(
  instructions: string,
  model: string,
  submitOutputCmd: string,
  options?: { minElapsedMs?: number },
): Promise<{
  content: string;
  metadata: Record<string, unknown>;
  sessionId: string | null;
  transcript: unknown[] | null;
  tokenUsage: { promptTokens: number; completionTokens: number; estimatedCostUsd: number };
}> {
  // Task ID is already embedded in the prompt by assembleTaskPrompt — use instructions as-is.
  const fullPrompt = instructions;

  const { cleanModel, modelID, providerID, goKeyPresent } = resolveModelProvider(model);

  log.info(
    { taskId: TASK_ID, model: cleanModel },
    '[opencode-harness] Starting opencode serve + session',
  );

  const serverHandle = await startOpencodeServer({
    port: 4096,
    cwd: '/app',
    healthTimeoutMs: 300000,
  });

  if (serverHandle === null) {
    throw new Error('[opencode-harness] Failed to start OpenCode server');
  }

  serverHandleGlobal = serverHandle;

  let sessionId: string | null = null;
  let transcript: unknown[] | null = null;
  let tokenUsage = { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 };

  // Build options once for all checkOutputFiles / readOutputContract calls in this session
  const outputOptions = {
    approvalRequired: process.env.APPROVAL_REQUIRED !== 'false',
    onNeedsApproval: (out: Parameters<typeof tryAutoPostApprovalCard>[1]) =>
      tryAutoPostApprovalCard(TASK_ID, out),
  };

  try {
    process.env.OPENROUTER_MODEL = modelID;
    process.env.OPENCODE_PROVIDER_ID = providerID;

    log.info(
      {
        component: 'opencode-harness',
        provider: providerID,
        model: modelID,
        originalModel: cleanModel,
        goKeyPresent,
      },
      `LLM provider resolved: ${providerID}/${modelID}`,
    );

    const sessionManager = createSessionManager(serverHandle.url);

    sessionId = await sessionManager.createSession(TASK_ID);
    if (sessionId === null) {
      throw new Error('[opencode-harness] Failed to create OpenCode session');
    }

    log.info({ taskId: TASK_ID, sessionId }, 'OpenCode session created — injecting prompt');

    const injected = await sessionManager.injectTaskPrompt(sessionId, fullPrompt);
    if (!injected) {
      throw new Error('[opencode-harness] Failed to inject prompt into OpenCode session');
    }

    log.info({ taskId: TASK_ID, sessionId }, 'Prompt injected — monitoring for completion');

    const serverExitedEarly = Symbol('serverExitedEarly');
    const monitorRace = await Promise.race([
      sessionManager
        .monitorSession(sessionId, {
          timeoutMs: 30 * 60 * 1000,
          minElapsedMs: options?.minElapsedMs ?? 30_000,
        })
        .then((r) => r as { completed: boolean; reason?: string }),
      serverHandle.onExit.then(() => serverExitedEarly as typeof serverExitedEarly),
    ]);

    if (monitorRace === serverExitedEarly) {
      log.warn(
        { taskId: TASK_ID, sessionId },
        '[opencode-harness] opencode serve exited — checking output files',
      );
      const { content, extraMetadata } = await checkOutputFiles(TASK_ID, outputOptions);
      if (content !== 'completed' || Object.keys(extraMetadata).length > 0) {
        log.info(
          { taskId: TASK_ID },
          '[opencode-harness] Output files found after server exit — treating as success',
        );
        serverHandleGlobal = null;
        return {
          content,
          metadata: { ...extraMetadata },
          sessionId,
          transcript: null,
          tokenUsage: { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
        };
      }
      throw new Error(
        '[opencode-harness] opencode serve exited before producing output — neither /tmp/summary.txt nor /tmp/approval-message.json was found',
      );
    }

    const monitorResult = monitorRace as { completed: boolean; reason?: string };

    if (!monitorResult.completed) {
      log.warn(
        { taskId: TASK_ID, sessionId },
        '[opencode-harness] Session timed out — checking output files',
      );
      const { content, extraMetadata } = await checkOutputFiles(TASK_ID, outputOptions);
      if (content !== 'completed' || Object.keys(extraMetadata).length > 0) {
        log.info(
          { taskId: TASK_ID },
          '[opencode-harness] Output files found after timeout — treating as success',
        );
        serverHandleGlobal = null;
        await serverHandle.kill();
        return {
          content,
          metadata: { ...extraMetadata },
          sessionId,
          transcript: null,
          tokenUsage: { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
        };
      }
      throw new Error(
        `[opencode-harness] OpenCode session did not complete: ${monitorResult.reason ?? 'unknown'}`,
      );
    }

    // Recovery nudge: if session completed but submit-output was skipped
    const summaryExistsCheck = await (async () => {
      try {
        const { readFile } = await import('fs/promises');
        await readFile('/tmp/summary.txt', 'utf8');
        return true;
      } catch {
        return false;
      }
    })();

    if (!summaryExistsCheck) {
      log.warn(
        { taskId: TASK_ID, sessionId },
        '[opencode-harness] submit-output not found after session idle — sending recovery nudge',
      );
      const nudgeMessage = `Your session went idle without producing the required output. Re-read your <execution-instructions> in AGENTS.md and complete ALL remaining steps you have not yet executed. You are not done until /tmp/summary.txt exists.`;
      await sessionManager.injectTaskPrompt(sessionId!, nudgeMessage);
      await sessionManager.monitorSession(sessionId!, {
        timeoutMs: 5 * 60 * 1000,
        minElapsedMs: 10_000,
      });
      const { content: nudgeContent, extraMetadata: nudgeMeta } = await checkOutputFiles(
        TASK_ID,
        outputOptions,
      );
      if (nudgeContent === 'completed' && Object.keys(nudgeMeta).length === 0) {
        throw new Error(
          '[opencode-harness] submit-output still not found after recovery nudge — task failed',
        );
      }
      return {
        content: nudgeContent,
        metadata: { ...nudgeMeta },
        sessionId,
        transcript: null,
        tokenUsage: { promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0 },
      };
    }

    // Fetch transcript before server is killed
    try {
      transcript = await sessionManager.getTranscript(sessionId!);
      if (transcript !== null) {
        tokenUsage = extractUsage(transcript);
      }
    } catch (err) {
      log.warn(
        { err },
        '[opencode-harness] Failed to fetch transcript — continuing without telemetry',
      );
    }

    log.info(
      { taskId: TASK_ID, sessionId, reason: monitorResult.reason },
      'OpenCode session completed successfully',
    );
  } finally {
    serverHandleGlobal = null;
    await serverHandle.kill();
    log.info('[opencode-harness] OpenCode server stopped');
  }

  // Normal completion path — read both output files; throw if neither was written
  const { content, extraMetadata } = await readOutputContract(TASK_ID, outputOptions);
  return { content, metadata: { ...extraMetadata }, sessionId, transcript, tokenUsage };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

interface ArchetypeRow {
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

interface TaskWithArchetype {
  id: string;
  status: string;
  tenant_id?: string | null;
  archetype_id?: string | null;
  archetypes?: ArchetypeRow | ArchetypeRow[] | null;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  // Fetch bash timeout from platform_settings DB and set into env before applyResourceCaps().
  // applyResourceCaps() respects already-set values (if (!env[key]) guard), so the DB value
  // takes precedence and the hardcoded fallback in resource-caps.ts applies only when DB is unavailable.
  try {
    const bashTimeout = await getPlatformSetting('worker_bash_timeout_ms');
    process.env['OPENCODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS'] = bashTimeout;
  } catch {
    log.warn(
      {},
      '[opencode-harness] worker_bash_timeout_ms not in platform_settings — applyResourceCaps will apply hardcoded fallback',
    );
  }
  applyResourceCaps();

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
    await runDeliveryPhase(task, archetype, TASK_ID, db, runOpencodeSession);
    return;
  }

  await runExecutionPhase(
    task,
    archetype,
    TASK_ID,
    db,
    runOpencodeSession,
    (handle) => {
      heartbeatHandleGlobal = handle;
    },
    () => {
      heartbeatHandleGlobal = null;
    },
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    log.error({ taskId: TASK_ID, err }, '[opencode-harness] Unhandled error in main');
    process.exit(1);
  });
}
