import { createLogger } from '../lib/logger.js';
import { createPostgRESTClient, type PostgRESTClient } from './lib/postgrest-client.js';
import { compileAgentsMd } from './lib/agents-md-compiler.mjs';
import { startOpencodeServer } from './lib/opencode-server.js';
import { createSessionManager, extractUsage } from './lib/session-manager.js';
import { startHeartbeat, type HeartbeatHandle } from './lib/heartbeat.js';
import { classifyFailure } from './lib/failure-codes.js';
import {
  parseStandardOutput,
  isApprovalRequired,
  type StandardOutput,
} from './lib/output-schema.mjs';
import { postApprovalCard } from './lib/approval-card-poster.mjs';
import { buildTemplateVars, substituteTemplateVars } from './lib/template-vars.js';
import { assembleTaskPrompt } from './lib/prompt-assembler.mjs';

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
  instructions?: string | null; // keep for backward compat (old field name)
  execution_instructions?: string | null; // new field name
  identity?: string | null; // NEW
  execution_steps?: string | null; // NEW
  delivery_steps?: string | null; // NEW
  temperature?: number | null; // NEW
  model?: string | null;
  deliverable_type?: string | null;
  runtime?: string | null;
  delivery_instructions?: string | null;
  enrichment_adapter?: string | null;
  risk_model?: { approval_required?: boolean; timeout_hours?: number } | null;
  tool_registry?: { tools?: string[] } | null;
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

type ServerHandle = { kill: () => Promise<void> };
let serverHandleGlobal: ServerHandle | null = null;
let heartbeatHandleGlobal: HeartbeatHandle | null = null;
const opencodeRunPid: number | null = null;

process.on('SIGTERM', () => {
  log.warn({ taskId: TASK_ID }, '[opencode-harness] SIGTERM received — marking task Failed');
  if (heartbeatHandleGlobal !== null) (heartbeatHandleGlobal as HeartbeatHandle).stop();
  if (serverHandleGlobal !== null) void (serverHandleGlobal as ServerHandle).kill();
  if (opencodeRunPid !== null) {
    try {
      process.kill(opencodeRunPid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
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

async function markFailed(
  reason: string,
  executionId: string | null,
  fromStatus: string,
  failureCode?: string,
): Promise<void> {
  try {
    await db.patch('tasks', `id=eq.${TASK_ID}`, {
      status: 'Failed',
      failure_reason: reason,
      failure_code: failureCode ?? null,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn({ err }, '[opencode-harness] Failed to PATCH task status to Failed');
  }
  try {
    await db.post('task_status_log', {
      task_id: TASK_ID,
      from_status: fromStatus,
      to_status: 'Failed',
      actor: 'machine',
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    log.warn({ err }, '[opencode-harness] Failed to log status transition to Failed (non-fatal)');
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

/**
 * Auto-post an approval card to Slack when the agent wrote a standard-schema summary.txt
 * with NEEDS_APPROVAL but did not post a card itself. Wrapped in try/catch — never throws.
 */
async function tryAutoPostApprovalCard(
  parsedOutput: StandardOutput,
): Promise<Record<string, unknown>> {
  const token = process.env.SLACK_BOT_TOKEN;
  const channel = process.env.NOTIFICATION_CHANNEL;

  if (!token || !channel) {
    log.warn(
      { taskId: TASK_ID, hasToken: !!token, hasChannel: !!channel },
      '[opencode-harness] Cannot auto-post approval card — missing SLACK_BOT_TOKEN or NOTIFICATION_CHANNEL',
    );
    return {};
  }

  try {
    const result = await postApprovalCard({
      data: parsedOutput,
      taskId: TASK_ID,
      channel,
      token,
      threadTs: process.env['NOTIFY_MSG_TS'] || undefined,
    });

    // Build rich metadata so the lifecycle can render context thread replies,
    // Done-state notifications, and delivery without null fields.
    const agentMeta = parsedOutput.metadata ?? {};
    const approvalMeta: Record<string, unknown> = {
      ts: result.ts,
      channel: result.channel,
      approval_message_ts: result.ts,
      target_channel: result.channel,
      // Delivery payload
      ...(parsedOutput.draft !== undefined && { draft_response: parsedOutput.draft }),
      // Confidence as a 0–1 number (not a percentage string)
      ...(parsedOutput.confidence !== undefined && { confidence: parsedOutput.confidence }),
      // Thread / conversation routing (from env vars injected by lifecycle)
      ...(process.env.THREAD_UID && {
        thread_uid: process.env.THREAD_UID,
        conversation_ref: process.env.THREAD_UID,
      }),
      ...(process.env.LEAD_UID && { lead_uid: process.env.LEAD_UID }),
      // Rich display fields written by the agent into StandardOutput.metadata
      ...(agentMeta['guest_name'] !== undefined && { guest_name: agentMeta['guest_name'] }),
      ...(agentMeta['property_name'] !== undefined && {
        property_name: agentMeta['property_name'],
      }),
      ...(agentMeta['original_message'] !== undefined && {
        original_message: agentMeta['original_message'],
      }),
      ...(agentMeta['check_in'] !== undefined && { check_in: agentMeta['check_in'] }),
      ...(agentMeta['check_out'] !== undefined && { check_out: agentMeta['check_out'] }),
      ...(agentMeta['booking_channel'] !== undefined && {
        booking_channel: agentMeta['booking_channel'],
      }),
      ...(agentMeta['lead_status'] !== undefined && { lead_status: agentMeta['lead_status'] }),
      ...(agentMeta['category'] !== undefined && { category: agentMeta['category'] }),
    };

    const { writeFile } = await import('fs/promises');
    await writeFile('/tmp/approval-message.json', JSON.stringify(approvalMeta), 'utf8');

    log.info(
      { taskId: TASK_ID, ts: result.ts, channel: result.channel },
      '[opencode-harness] Auto-posted approval card and wrote /tmp/approval-message.json',
    );

    return approvalMeta;
  } catch (err) {
    log.error(
      { taskId: TASK_ID, err },
      '[opencode-harness] Failed to auto-post approval card — continuing without card',
    );
    return {};
  }
}

async function writeOpencodeAuth(temperature: number = 1.0): Promise<void> {
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
  // The "*": "allow" wildcard covers all permission types including "skill" — no explicit skill permission needed
  const configJson = JSON.stringify(
    {
      agent: { build: { temperature } },
      permission: { '*': 'allow', question: 'deny' },
      autoupdate: false,
    },
    null,
    2,
  );
  await writeFile(join(configDir, 'opencode.json'), configJson, 'utf8');
  log.info({ temperature }, '[opencode-harness] opencode.json permission config written');

  // Also write global config to prevent auto-update at the global level
  const globalConfigDir = join(homedir(), '.config', 'opencode');
  await mkdir(globalConfigDir, { recursive: true });
  const globalConfigJson = JSON.stringify({ autoupdate: false }, null, 2);
  await writeFile(join(globalConfigDir, 'opencode.json'), globalConfigJson, 'utf8');
  log.info('[opencode-harness] global opencode.json written (autoupdate: false)');

  // Log available skills baked into the container image
  const skillsDir = '/app/.opencode/skills';
  try {
    const { readdirSync } = await import('fs');
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    const skills = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    log.info({ skills }, '[opencode-harness] Skills available in container');
  } catch {
    log.info('[opencode-harness] No skills directory found — container has no baked-in skills');
  }
}

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

  const modelID = model.startsWith('openrouter/') ? model.slice('openrouter/'.length) : model;

  log.info(
    { taskId: TASK_ID, model: modelID },
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

  try {
    process.env.OPENROUTER_MODEL = modelID;
    process.env.OPENCODE_PROVIDER_ID = 'openrouter';

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

    const { readFile } = await import('fs/promises');

    const checkOutputFiles = async (): Promise<{
      content: string;
      extraMetadata: Record<string, unknown>;
    }> => {
      let content = 'completed';
      let extraMetadata: Record<string, unknown> = {};
      try {
        const summaryText = await readFile('/tmp/summary.txt', 'utf8');
        if (summaryText.trim()) {
          content = summaryText.trim();
          log.info({ taskId: TASK_ID }, '[opencode-harness] Read summary from /tmp/summary.txt');
        }
      } catch {
        // not written
      }
      let approvalJsonExists = false;
      try {
        const approvalJson = await readFile('/tmp/approval-message.json', 'utf8');
        const approvalData = JSON.parse(approvalJson) as Record<string, unknown>;
        const PLACEHOLDER_PATTERN = /PLACEHOLDER/i;
        const tsVal = String(approvalData.ts ?? '');
        const channelVal = String(approvalData.channel ?? '');
        if (
          !tsVal ||
          !channelVal ||
          PLACEHOLDER_PATTERN.test(tsVal) ||
          PLACEHOLDER_PATTERN.test(channelVal)
        ) {
          const msg = `[opencode-harness] Invalid approval metadata detected — ts="${tsVal}", channel="${channelVal}". The model likely wrote placeholders instead of a real Slack ts/channel. Failing task.`;
          log.error({ taskId: TASK_ID }, msg);
          throw new Error(msg);
        }
        extraMetadata = {
          ...approvalData,
          approval_message_ts: approvalData.ts,
          target_channel: approvalData.channel,
          ...(approvalData.conversationRef !== undefined && {
            conversation_ref: approvalData.conversationRef,
          }),
        };
        approvalJsonExists = true;
        log.info(
          { taskId: TASK_ID },
          '[opencode-harness] Read approval metadata from /tmp/approval-message.json',
        );
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('[opencode-harness] Invalid')) {
          throw err; // re-throw validation errors
        }
        // not written — swallow file-not-found errors only
      }
      // Auto-post approval card if summary has NEEDS_APPROVAL but agent did not post a card
      if (!approvalJsonExists && content !== 'completed') {
        const parsedOutput = parseStandardOutput(content);
        if (parsedOutput && isApprovalRequired(parsedOutput)) {
          if (process.env.APPROVAL_REQUIRED === 'false') {
            log.info(
              { taskId: TASK_ID },
              '[opencode-harness] Skipping auto-post approval card — approval not required',
            );
          } else {
            const autoMeta = await tryAutoPostApprovalCard(parsedOutput);
            if (Object.keys(autoMeta).length > 0) {
              extraMetadata = autoMeta;
            }
          }
        }
      }
      return { content, extraMetadata };
    };

    if (monitorRace === serverExitedEarly) {
      log.warn(
        { taskId: TASK_ID, sessionId },
        '[opencode-harness] opencode serve exited — checking output files',
      );
      const { content, extraMetadata } = await checkOutputFiles();
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
      const { content, extraMetadata } = await checkOutputFiles();
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
      const { content: nudgeContent, extraMetadata: nudgeMeta } = await checkOutputFiles();
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

  const { readFile: readFileFinal } = await import('fs/promises');
  let content = 'completed';
  let extraMetadata: Record<string, unknown> = {};

  try {
    const summaryText = await readFileFinal('/tmp/summary.txt', 'utf8');
    if (summaryText.trim()) {
      content = summaryText.trim();
      log.info({ taskId: TASK_ID }, '[opencode-harness] Read summary from /tmp/summary.txt');
    }
  } catch {
    // not written
  }

  let approvalJsonExists = false;
  try {
    const approvalJson = await readFileFinal('/tmp/approval-message.json', 'utf8');
    const approvalData = JSON.parse(approvalJson) as Record<string, unknown>;
    const PLACEHOLDER_PATTERN = /PLACEHOLDER/i;
    const tsVal = String(approvalData.ts ?? '');
    const channelVal = String(approvalData.channel ?? '');
    if (
      !tsVal ||
      !channelVal ||
      PLACEHOLDER_PATTERN.test(tsVal) ||
      PLACEHOLDER_PATTERN.test(channelVal)
    ) {
      const msg = `[opencode-harness] Invalid approval metadata detected — ts="${tsVal}", channel="${channelVal}". The model likely wrote placeholders instead of a real Slack ts/channel. Failing task.`;
      log.error({ taskId: TASK_ID }, msg);
      throw new Error(msg);
    }
    extraMetadata = {
      ...approvalData,
      approval_message_ts: approvalData.ts,
      target_channel: approvalData.channel,
      ...(approvalData.conversationRef !== undefined && {
        conversation_ref: approvalData.conversationRef,
      }),
    };
    approvalJsonExists = true;
    log.info(
      { taskId: TASK_ID },
      '[opencode-harness] Read approval metadata from /tmp/approval-message.json',
    );
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('[opencode-harness] Invalid')) {
      throw err; // re-throw validation errors
    }
    // not written — swallow file-not-found errors only
  }

  // Auto-post approval card if summary has NEEDS_APPROVAL but agent did not post a card
  if (!approvalJsonExists && content !== 'completed') {
    const parsedOutput = parseStandardOutput(content);
    if (parsedOutput && isApprovalRequired(parsedOutput)) {
      if (process.env.APPROVAL_REQUIRED === 'false') {
        log.info(
          { taskId: TASK_ID },
          '[opencode-harness] Skipping auto-post approval card — approval not required',
        );
      } else {
        const autoMeta = await tryAutoPostApprovalCard(parsedOutput);
        if (Object.keys(autoMeta).length > 0) {
          extraMetadata = autoMeta;
        }
      }
    }
  }

  if (content === 'completed' && Object.keys(extraMetadata).length === 0) {
    throw new Error(
      '[opencode-harness] Model did not produce content — /tmp/summary.txt and /tmp/approval-message.json were not written. This is a model reliability issue; retry the task.',
    );
  }

  return { content, metadata: { ...extraMetadata }, sessionId, transcript, tokenUsage };
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
    // 1. Fetch the approved deliverable content from DB
    const deliverableRows = await db.get(
      'deliverables',
      `external_ref=eq.${TASK_ID}&select=*&order=created_at.desc&limit=1`,
    );
    const deliverable = deliverableRows?.[0] as Record<string, unknown> | undefined;
    if (!deliverable) {
      log.error({ taskId: TASK_ID }, '[opencode-harness] No deliverable found for delivery phase');
      await markFailed(
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
        task_id: TASK_ID,
        runtime_type: 'opencode',
        status: 'running',
        phase: 'delivery',
        updated_at: new Date().toISOString(),
      });
      deliveryExecId =
        deliveryExecRecord && typeof (deliveryExecRecord as { id?: unknown }).id === 'string'
          ? (deliveryExecRecord as { id: string }).id
          : deliveryExecutionId;
      log.info(
        { taskId: TASK_ID, deliveryExecId },
        '[opencode-harness] Delivery execution record created',
      );
    } catch (err) {
      log.warn(
        { err },
        '[opencode-harness] Failed to create delivery execution record — non-fatal',
      );
      deliveryExecId = null;
    }

    // 3. Build delivery prompt with injected deliverable content — use assembleTaskPrompt for
    //    consistency with the execution phase (adds date/epoch prefix + Task ID suffix).
    const deliveryPrompt = assembleTaskPrompt({
      instructions: `Follow the instructions in <delivery-instructions> within the AGENTS.md file\n\n<approved-content>\n${deliverableContent}\n</approved-content>`,
      taskId: TASK_ID,
    });

    // 4. Auth setup — required before OpenCode session
    await writeOpencodeAuth(archetype.temperature ?? 1.0);

    // 5. Compile AGENTS.md for delivery phase (same compiled doc, delivery prompt points to <delivery-instructions>)
    try {
      const { writeFile } = await import('node:fs/promises');
      const compiledAgentsMd = compileAgentsMd({
        identity: archetype.identity ?? '',
        executionSteps: archetype.execution_steps ?? '',
        deliverySteps: archetype.delivery_steps ?? archetype.delivery_instructions ?? '',
        employeeRules: '',
        employeeKnowledge: '',
      });
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
        { taskId: TASK_ID },
        '[opencode-harness] Archetype has no model configured for delivery phase',
      );
      if (deliveryExecId) {
        await db
          .patch('executions', `id=eq.${deliveryExecId}`, {
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .catch(() => {});
      }
      await markFailed('Archetype has no model configured', null, 'Delivering', 'missing_model');
      return;
    }
    let deliveryResult: Awaited<ReturnType<typeof runOpencodeSession>> | null = null;
    try {
      deliveryResult = await runOpencodeSession(
        deliveryPrompt,
        archetype.model,
        'tsx /tools/platform/submit-output.ts --summary "<one sentence describing what you accomplished>" --classification "NO_ACTION_NEEDED"',
        { minElapsedMs: 10_000 },
      );
    } catch (err) {
      log.error({ taskId: TASK_ID, err }, '[opencode-harness] Delivery OpenCode session failed');
      const deliveryErr = err instanceof Error ? err.message : String(err);
      if (deliveryExecId) {
        await db
          .patch('executions', `id=eq.${deliveryExecId}`, {
            status: 'failed',
            updated_at: new Date().toISOString(),
          })
          .catch(() => {});
      }
      await markFailed(deliveryErr, null, 'Delivering', classifyFailure(deliveryErr));
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
          { taskId: TASK_ID, deliveryExecId, ...usage },
          '[opencode-harness] Delivery execution metrics persisted',
        );
      } catch (err) {
        log.warn(
          { err },
          '[opencode-harness] Failed to persist delivery execution metrics — non-fatal',
        );
      }
    }

    // 7. Verify delivery confirmation from /tmp/summary.txt
    {
      const { readFile: deliveryReadFile } = await import('fs/promises');
      let summaryRaw: string;
      try {
        summaryRaw = await deliveryReadFile('/tmp/summary.txt', 'utf8');
      } catch {
        await markFailed(
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
          'Delivery not confirmed — summary.txt is not valid JSON',
          null,
          'Delivering',
          classifyFailure('Delivery not confirmed — summary.txt is not valid JSON'),
        );
        return;
      }
      if (deliverySummary.delivered !== true && !deliverySummary.summary) {
        await markFailed(
          'Delivery not confirmed — summary.txt missing both delivered:true and summary field',
          null,
          'Delivering',
          classifyFailure(
            'Delivery not confirmed — summary.txt missing both delivered:true and summary field',
          ),
        );
        return;
      }
      log.info({ taskId: TASK_ID }, '[opencode-harness] Delivery confirmed via summary.txt');
    }

    // 8. Mark task Done
    await db.patch('tasks', `id=eq.${TASK_ID}`, {
      status: 'Done',
      updated_at: new Date().toISOString(),
    });
    try {
      await db.post('task_status_log', {
        task_id: TASK_ID,
        from_status: 'Delivering',
        to_status: 'Done',
        actor: 'machine',
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      log.warn({ err }, '[opencode-harness] Failed to log Delivering→Done transition (non-fatal)');
    }
    log.info({ taskId: TASK_ID }, '[opencode-harness] Delivery phase complete — task Done');
    await fireCompletionEvent(TASK_ID);
    process.exit(0);
  }

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
    log.error(
      { taskId: TASK_ID },
      '[opencode-harness] Archetype has no model configured — cannot proceed',
    );
    await markFailed(
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
      { taskId: TASK_ID, archetypeId: archetype.id },
      '[opencode-harness] Archetype has no identity or execution_steps — AGENTS.md may be incomplete',
    );
  }

  // Build template variable map from process.env (INPUT_* + worker_env) and apply substitution
  const templateVars = buildTemplateVars();
  const resolvedInstructions = substituteTemplateVars(instructions, templateVars);

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

  // Start heartbeat after execution record creation
  if (executionId) {
    heartbeatHandleGlobal = startHeartbeat({ executionId, postgrestClient: db });
    log.info({ taskId: TASK_ID, executionId }, '[opencode-harness] Heartbeat started');
  }

  await db.patch('tasks', `id=eq.${TASK_ID}`, {
    status: 'Executing',
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  log.info({ taskId: TASK_ID }, 'Task status → Executing');

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
    });
    await writeFile('/app/AGENTS.md', compiledAgentsMd, 'utf8');
    log.info('[opencode-harness] Compiled AGENTS.md written (template compiler)');

    // Save compiled snapshot to task for debugging
    try {
      await db.patch('tasks', `id=eq.${TASK_ID}`, {
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

  // Platform-level submit-output reminder appended to every employee's task prompt.
  // Placed at the end to leverage recency effect — last thing the model reads before generating.
  const taskPrompt = assembleTaskPrompt({
    instructions: resolvedInstructions,
    taskId: TASK_ID,
  });
  const submitOutputCmd = `tsx /tools/platform/submit-output.ts --summary "<one sentence describing what you accomplished>" --classification "${approvalRequired ? 'NEEDS_APPROVAL' : 'NO_ACTION_NEEDED'}"`;

  try {
    const result = await runOpencodeSession(taskPrompt, model, submitOutputCmd, {
      minElapsedMs: 10_000,
    });
    content = result.content;
    metadata = result.metadata;
    sessionTranscript = result.transcript;
    sessionTokenUsage = result.tokenUsage;
  } catch (err) {
    log.error({ taskId: TASK_ID, err }, '[opencode-harness] OpenCode session failed');
    const failureReason = err instanceof Error ? err.message : String(err);
    await markFailed(failureReason, executionId, 'Executing', classifyFailure(failureReason));
    process.exit(1);
  }

  // Stop heartbeat now that session is done
  if (heartbeatHandleGlobal !== null) {
    heartbeatHandleGlobal.stop();
    heartbeatHandleGlobal = null;
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
        { taskId: TASK_ID, executionId, ...sessionTokenUsage },
        '[opencode-harness] Execution metrics persisted',
      );
    } catch (err) {
      log.warn({ err }, '[opencode-harness] Failed to persist execution metrics — non-fatal');
    }
  }

  // Set completed_at on task
  try {
    await db.patch('tasks', `id=eq.${TASK_ID}`, {
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
