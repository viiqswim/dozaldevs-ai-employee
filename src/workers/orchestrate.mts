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

  // ── Step 4: Resolve tooling config ───────────────────────────────────────
  // Uses defaults for the fix loop; project config is fetched in Step 12.
  const toolingConfigResolved = resolveToolingConfig(null);

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
    toolingConfig: toolingConfigResolved,
    postgrestClient,
    heartbeat,
    taskId: task.id,
  });

  if (fixResult.success) {
    // ── Step 12: Fetch project config (tooling_config + repo URL) ───────────
    heartbeat.updateStage('completing');
    await patchExecution(postgrestClient, executionId, { current_stage: 'completing' });
    const projectConfig = await fetchProjectConfig(task.project_id ?? '', postgrestClient);
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
      console.error(`[orchestrate] Failed to ensure branch: ${branchResult.error ?? 'unknown'}`);
      heartbeat.stop();
      await serverHandle.kill();
      process.exit(1);
    }

    // ── Step 14: Commit and push changes ─────────────────────────────────────
    const commitMessage = `feat: ${task.external_id} - ${summary}`;
    const pushResult = await commitAndPush(branchName, commitMessage, '/workspace');
    if (pushResult.error) {
      console.error(`[orchestrate] Push failed: ${pushResult.error}`);
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
          console.warn(`[orchestrate] PR creation failed: ${err.message}`);
          return null;
        });
        prUrl = prResult?.pr?.html_url ?? null;
      }
    }

    // ── Step 16: Run completion flow (Supabase-first write → Inngest event) ──
    const completionResult = await runCompletionFlow(
      { taskId: task.id, executionId: executionId ?? '', prUrl },
      postgrestClient,
    );
    if (!completionResult.supabaseWritten) {
      console.error('[orchestrate] Completion Supabase write failed — task state lost');
      heartbeat.stop();
      await serverHandle.kill();
      process.exit(1);
    }
    if (!completionResult.inngestSent) {
      console.warn('[orchestrate] Inngest event not sent — watchdog will recover');
    }

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
