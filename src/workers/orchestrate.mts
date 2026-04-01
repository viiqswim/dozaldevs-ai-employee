/**
 * Main orchestration entrypoint for the AI Employee worker.
 * Called by entrypoint.sh Step 8 after boot sequence completes.
 *
 * Wires together all 11 modules:
 *   1. PostgREST client — DB access without Prisma
 *   2. Task context — parse .task-context.json and build prompt
 *   3. OpenCode server — spawn and health-check opencode serve
 *   4. Session manager — create session, inject prompt, monitor
 *   5. Validation pipeline — run TS/lint/test checks (via fix-loop)
 *   6. Fix loop — auto-retry failed stages up to limits
 *   7. Heartbeat — periodic DB keep-alive during long operations
 *   8. Branch manager — create/ensure branch, commit and push
 *   9. PR manager — create or update GitHub PR
 *  10. Completion flow — write Supabase-first, then send Inngest event
 *  11. Project config — fetch project metadata from DB
 */

import * as fs from 'fs';
import { createPostgRESTClient, type PostgRESTClient } from './lib/postgrest-client.js';
import { parseTaskContext, buildPrompt, resolveToolingConfig } from './lib/task-context.js';
import { startOpencodeServer } from './lib/opencode-server.js';
import { createSessionManager } from './lib/session-manager.js';
import { runWithFixLoop } from './lib/fix-loop.js';
import { startHeartbeat, type HeartbeatHandle } from './lib/heartbeat.js';
import { buildBranchName, ensureBranch, commitAndPush } from './lib/branch-manager.js';
import { createOrUpdatePR } from './lib/pr-manager.js';
import { runCompletionFlow } from './lib/completion.js';
import { fetchProjectConfig, parseRepoOwnerAndName } from './lib/project-config.js';
import { TokenTracker } from './lib/token-tracker.js';
import { computeVersionHash } from '../lib/agent-version.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('orchestrate');

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
// Helper: upsert agent version via PostgREST (find-or-create semantics)
// ---------------------------------------------------------------------------

async function ensureAgentVersionViaPostgREST(
  client: PostgRESTClient,
  params: { promptHash: string; modelId: string; toolConfigHash: string },
): Promise<string | null> {
  try {
    // 1. Try to find existing version with same hash combination
    const existing = await client.get(
      'agent_versions',
      `prompt_hash=eq.${params.promptHash}&model_id=eq.${params.modelId}&tool_config_hash=eq.${params.toolConfigHash}&limit=1`,
    );
    if (existing && existing.length > 0) {
      const record = existing[0] as { id: string };
      return record.id ?? null;
    }

    // 2. Create new version if not found
    const created = await client.post('agent_versions', {
      prompt_hash: params.promptHash,
      model_id: params.modelId,
      tool_config_hash: params.toolConfigHash,
      changelog_note: 'Auto-created at execution start',
      is_active: true,
    });
    if (created && typeof (created as Record<string, unknown>).id === 'string') {
      return (created as { id: string }).id;
    }

    return null;
  } catch (err) {
    log.warn(
      `[orchestrate] Failed to ensure agent version: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

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
    log.warn(
      `[orchestrate] Failed to patch execution: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main orchestration flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Token tracking: will accumulate data if direct callLLM() calls are made.
  // NOTE: OpenCode SDK v1 does not expose per-session token usage data,
  // so tokens from OpenCode sessions are not tracked.
  const tokenTracker = new TokenTracker();

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
    log.error('[orchestrate] Failed to parse task context — aborting');
    process.exit(1);
  }

  // ── Step 4: Fetch project config and resolve tooling config ──────────────
  // Fetch early so real tooling_config can be passed to fix loop.
  const projectConfig = await fetchProjectConfig(task.project_id ?? '', postgrestClient);
  const toolingConfigResolved = resolveToolingConfig(projectConfig);

  // ── Step 5: Build prompt ─────────────────────────────────────────────────
  const prompt = buildPrompt(task);

  // ── Step 6: PATCH execution record with starting stage + agent version ────
  const {
    promptHash,
    modelId: versionModelId,
    toolConfigHash,
  } = computeVersionHash({
    promptTemplate: 'opencode-execution-v1',
    modelId: process.env.OPENROUTER_MODEL ?? 'minimax/minimax-m2.7',
    toolConfig: { version: '1.0', opencode: true },
  });

  const agentVersionId = await ensureAgentVersionViaPostgREST(postgrestClient, {
    promptHash,
    modelId: versionModelId,
    toolConfigHash,
  });

  await patchExecution(postgrestClient, executionId, {
    current_stage: 'starting',
    agent_version_id: agentVersionId,
    updated_at: new Date().toISOString(),
  });

  // ── Step 7: Start heartbeat ───────────────────────────────────────────────
  const heartbeat = startHeartbeat({ executionId, postgrestClient, currentStage: 'starting' });
  heartbeatGlobal = heartbeat;

  // ── Step 8: Start OpenCode server ────────────────────────────────────────
  const serverHandle = await startOpencodeServer({ port: 4096, cwd: '/workspace' });
  if (serverHandle === null) {
    log.error('[orchestrate] Failed to start OpenCode server');
    heartbeat.stop();
    await patchExecution(postgrestClient, executionId, {
      status: 'failed',
      current_stage: 'error',
    });
    process.exit(1);
  }
  serverHandleGlobal = serverHandle;

  // ── Step 8.5: Configure OpenRouter provider via REST API (belt-and-suspenders) ──
  if (process.env.OPENROUTER_API_KEY) {
    try {
      await fetch(`${serverHandle.url}/auth/openrouter`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'api', key: process.env.OPENROUTER_API_KEY }),
      });
      log.info('[orchestrate] OpenRouter provider configured via REST API');
    } catch (err) {
      log.warn(
        `[orchestrate] Failed to configure OpenRouter via REST API — auth.json fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Step 9: Create session and inject prompt ──────────────────────────────
  const sessionManager = createSessionManager(serverHandle.url);
  const sessionId = await sessionManager.createSession(`Task ${task.external_id}`);
  if (sessionId === null) {
    log.error('[orchestrate] Failed to create OpenCode session');
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
    log.error('[orchestrate] Session timed out during code generation');
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
    toolingConfig: toolingConfigResolved,
    postgrestClient,
    heartbeat,
    taskId: task.id,
  });

  if (fixResult.success) {
    // ── Step 12: Use project config (already fetched in Step 4) ─────────────
    heartbeat.updateStage('completing');
    await patchExecution(postgrestClient, executionId, { current_stage: 'completing' });
    const { owner, repo } = projectConfig
      ? parseRepoOwnerAndName(projectConfig.repo_url)
      : { owner: '', repo: '' };
    const defaultBranch = projectConfig?.default_branch ?? 'main';

    // ── Step 13: Ensure task branch ──────────────────────────────────────────
    const triageResult = task.triage_result as Record<string, unknown> | null;
    const summary = (triageResult?.summary as string | undefined) ?? task.external_id ?? 'task';
    const branchName = buildBranchName(task.external_id ?? 'TASK-0', summary);
    const branchResult = await ensureBranch(branchName, '/workspace');
    if (!branchResult.success) {
      log.error(`[orchestrate] Failed to ensure branch: ${branchResult.error ?? 'unknown'}`);
      heartbeat.stop();
      await serverHandle.kill();
      process.exit(1);
    }

    // ── Step 14: Commit and push changes ─────────────────────────────────────
    const commitMessage = `feat: ${task.external_id} - ${summary}`;
    const pushResult = await commitAndPush(branchName, commitMessage, '/workspace');
    if (pushResult.error) {
      log.error(`[orchestrate] Push failed: ${pushResult.error}`);
      heartbeat.stop();
      await serverHandle.kill();
      process.exit(1);
    }

    // ── Step 15: Create or update PR ─────────────────────────────────────────
    let prUrl: string | null = null;
    if (pushResult.pushed && owner && repo) {
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken) {
        const { createGitHubClient } = await import('../lib/github-client.js');
        const githubClient = createGitHubClient({ token: githubToken });
        const prResult = await createOrUpdatePR(
          {
            owner,
            repo,
            headBranch: branchName,
            base: defaultBranch,
            ticketId: task.external_id ?? 'TASK-0',
            summary,
            task,
            executionId,
          },
          githubClient,
        ).catch((err: Error) => {
          log.warn(`[orchestrate] PR creation failed: ${err.message}`);
          return null;
        });
        prUrl = prResult?.pr?.html_url ?? null;
      }
    }

    // ── Step 16: Persist accumulated token counts, then run completion flow ──
    const accumulated = tokenTracker.getAccumulated();
    // Only write if there's real token data (OpenCode SDK v1 doesn't expose per-session token usage;
    // this guard prevents writing misleading zero values to the DB)
    if (accumulated.promptTokens > 0 || accumulated.completionTokens > 0) {
      await patchExecution(postgrestClient, executionId, {
        prompt_tokens: accumulated.promptTokens,
        completion_tokens: accumulated.completionTokens,
        estimated_cost_usd: accumulated.estimatedCostUsd,
        primary_model_id: accumulated.primaryModelId || null,
      });
    }

    const completionResult = await runCompletionFlow(
      { taskId: task.id, executionId: executionId ?? '', prUrl },
      postgrestClient,
    );
    if (!completionResult.supabaseWritten) {
      log.error('[orchestrate] Completion Supabase write failed — task state lost');
      heartbeat.stop();
      await serverHandle.kill();
      process.exit(1);
    }
    if (!completionResult.inngestSent) {
      log.warn('[orchestrate] Inngest event not sent — watchdog will recover');
    }

    await patchExecution(postgrestClient, executionId, {
      status: 'completed',
      current_stage: 'done',
      updated_at: new Date().toISOString(),
    });
    log.info(`[orchestrate] Task ${task.external_id} completed successfully`);
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(0);
  } else {
    // escalate() was already called inside fix-loop — persist partial token counts before exit
    const accumulatedOnFailure = tokenTracker.getAccumulated();
    // Only write if there's real token data (OpenCode SDK v1 doesn't expose per-session token usage;
    // this guard prevents writing misleading zero values to the DB)
    if (accumulatedOnFailure.promptTokens > 0 || accumulatedOnFailure.completionTokens > 0) {
      await patchExecution(postgrestClient, executionId, {
        prompt_tokens: accumulatedOnFailure.promptTokens,
        completion_tokens: accumulatedOnFailure.completionTokens,
        estimated_cost_usd: accumulatedOnFailure.estimatedCostUsd,
        primary_model_id: accumulatedOnFailure.primaryModelId || null,
      });
    }
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  log.error(`[orchestrate] Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
