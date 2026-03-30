/**
 * Main orchestration entrypoint for the AI Employee worker.
 * Called by entrypoint.sh Step 8 after boot sequence completes.
 *
 * Wires together all 7 modules:
 *   1. PostgREST client — DB access without Prisma
 *   2. Task context — parse .task-context.json and build prompt
 *   3. OpenCode server — spawn and health-check opencode serve
 *   4. Session manager — create session, inject prompt, monitor
 *   5. Validation pipeline — run TS/lint/test checks (via fix-loop)
 *   6. Fix loop — auto-retry failed stages up to limits
 *   7. Heartbeat — periodic DB keep-alive during long operations
 *
 * Known limitations (Phase 5 MVP):
 *   - Does NOT send engineering/task.completed Inngest event (Phase 6)
 *   - Does NOT create branches or PRs (Phase 6)
 *   - Does NOT track token usage (Phase 7)
 */

import * as fs from 'fs';
import { createPostgRESTClient, type PostgRESTClient } from './lib/postgrest-client.js';
import { parseTaskContext, buildPrompt, resolveToolingConfig } from './lib/task-context.js';
import { startOpencodeServer } from './lib/opencode-server.js';
import { createSessionManager } from './lib/session-manager.js';
import { runWithFixLoop } from './lib/fix-loop.js';
import { startHeartbeat, type HeartbeatHandle } from './lib/heartbeat.js';

// ---------------------------------------------------------------------------
// Process cleanup globals — set after creation so signal handlers can reach them
// ---------------------------------------------------------------------------

let serverHandleGlobal: { kill: () => Promise<void> } | null = null;
let heartbeatGlobal: HeartbeatHandle | null = null;

process.on('exit', () => {
  heartbeatGlobal?.stop();
});

process.on('SIGTERM', () => {
  heartbeatGlobal?.stop();
  void serverHandleGlobal?.kill();
  process.exit(0);
});

// ---------------------------------------------------------------------------
// Helper: fire-and-forget-safe PATCH wrapper
// ---------------------------------------------------------------------------

async function patchExecution(
  client: PostgRESTClient,
  executionId: string | null,
  body: Record<string, unknown>,
): Promise<void> {
  if (!executionId) return;
  try {
    await client.patch('executions', `id=eq.${executionId}`, body);
  } catch (err) {
    console.warn(
      `[orchestrate] Failed to patch execution: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main orchestration flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // ── Step 1: Read execution ID ────────────────────────────────────────────
  const executionIdFile = '/tmp/.execution-id';
  let executionId: string | null = null;
  try {
    const raw = fs.readFileSync(executionIdFile, 'utf8').trim();
    executionId = raw.length > 0 ? raw : null;
  } catch {
    // File missing — execution may not have been written yet; proceed without it
  }

  // ── Step 2: Create PostgREST client ──────────────────────────────────────
  const postgrestClient = createPostgRESTClient();

  // ── Step 3: Parse task context ───────────────────────────────────────────
  const task = parseTaskContext('/workspace/.task-context.json');
  if (task === null) {
    console.error('[orchestrate] Failed to parse task context — aborting');
    process.exit(1);
  }

  // ── Step 4: Resolve tooling config (Phase 5 MVP: use defaults) ───────────
  // In a future phase, fetch the project row from DB and pass its tooling_config.
  const toolingConfig = resolveToolingConfig(null);

  // ── Step 5: Build prompt ─────────────────────────────────────────────────
  const prompt = buildPrompt(task);

  // ── Step 6: PATCH execution record with starting stage ───────────────────
  await patchExecution(postgrestClient, executionId, {
    current_stage: 'starting',
    agent_version_id: process.env.AGENT_VERSION_ID ?? null,
    updated_at: new Date().toISOString(),
  });

  // ── Step 7: Start heartbeat ───────────────────────────────────────────────
  const heartbeat = startHeartbeat({ executionId, postgrestClient, currentStage: 'starting' });
  heartbeatGlobal = heartbeat;

  // ── Step 8: Start OpenCode server ────────────────────────────────────────
  const serverHandle = await startOpencodeServer({ port: 4096, cwd: '/workspace' });
  if (serverHandle === null) {
    console.error('[orchestrate] Failed to start OpenCode server');
    heartbeat.stop();
    await patchExecution(postgrestClient, executionId, {
      status: 'failed',
      current_stage: 'error',
    });
    process.exit(1);
  }
  serverHandleGlobal = serverHandle;

  // ── Step 9: Create session and inject prompt ──────────────────────────────
  const sessionManager = createSessionManager(serverHandle.url);
  const sessionId = await sessionManager.createSession(`Task ${task.external_id}`);
  if (sessionId === null) {
    console.error('[orchestrate] Failed to create OpenCode session');
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(1);
  }
  await sessionManager.injectTaskPrompt(sessionId, prompt);

  // ── Step 10: Monitor session (wait for code generation to complete) ───────
  heartbeat.updateStage('executing');
  await patchExecution(postgrestClient, executionId, { current_stage: 'executing' });

  const monitorResult = await sessionManager.monitorSession(sessionId, {
    timeoutMs: 60 * 60 * 1000, // 60 minutes for code generation
  });
  if (!monitorResult.completed) {
    console.error('[orchestrate] Session timed out during code generation');
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(1);
  }

  // ── Step 11: Run fix loop (validation pipeline + automatic fixes) ─────────
  heartbeat.updateStage('validating');
  await patchExecution(postgrestClient, executionId, { current_stage: 'validating' });

  const fixResult = await runWithFixLoop({
    sessionId,
    sessionManager,
    executionId,
    toolingConfig,
    postgrestClient,
    heartbeat,
    taskId: task.id,
  });

  // ── Step 12: Handle result ────────────────────────────────────────────────
  if (fixResult.success) {
    await patchExecution(postgrestClient, executionId, {
      status: 'completed',
      current_stage: 'done',
      updated_at: new Date().toISOString(),
    });
    console.info(`[orchestrate] Task ${task.external_id} completed successfully`);
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(0);
  } else {
    // escalate() was already called inside fix-loop
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error(
    `[orchestrate] Unhandled error: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
});
