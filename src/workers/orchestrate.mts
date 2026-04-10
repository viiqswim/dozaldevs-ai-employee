/**
 * Main orchestration entrypoint for the AI Employee worker.
 * Called by entrypoint.sh Step 8 after boot sequence completes.
 *
 * Two-phase architecture (Wave 3):
 *   Phase 1 — Planning: AI agent writes a structured PLAN.md
 *   Phase 2 — Execution: wave-by-wave code implementation with cost-breaker,
 *              continuation dispatching, between-wave push, and plan sync
 *
 * Safety net: fix-loop + validation pipeline runs after all waves complete.
 * Completion: Supabase-first write, then Inngest event (non-negotiable ordering).
 */

import * as fs from 'fs';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';

import { createPostgRESTClient, type PostgRESTClient } from './lib/postgrest-client.js';
import {
  parseTaskContext,
  buildPrompt,
  resolveToolingConfig,
  type TaskRow,
  type ToolingConfig,
} from './lib/task-context.js';
import { startOpencodeServer } from './lib/opencode-server.js';
import { createSessionManager, type SessionManager } from './lib/session-manager.js';
import { runWithFixLoop } from './lib/fix-loop.js';
import { startHeartbeat, escalate, type HeartbeatHandle } from './lib/heartbeat.js';
import { buildBranchName, ensureBranch, commitAndPush } from './lib/branch-manager.js';
import { createOrUpdatePR } from './lib/pr-manager.js';
import { runCompletionFlow } from './lib/completion.js';
import { fetchProjectConfig, parseRepoOwnerAndName } from './lib/project-config.js';
import type { ProjectConfig } from './lib/project-config.js';
import { runInstallCommand } from './lib/install-runner.js';
import { TokenTracker } from './lib/token-tracker.js';
import { computeVersionHash } from '../lib/agent-version.js';
import { createLogger, logStep, logTiming, logTool, logCost } from '../lib/logger.js';
import { readConfigFromEnv } from './config/long-running.js';
import type { LongRunningConfig, WaveState } from './config/long-running.js';
import { parsePlan } from './lib/plan-parser.js';
import type { ParsedPlan } from './lib/plan-parser.js';
import { CostTrackerV2 } from './lib/cost-tracker-v2.js';
import { CostBreaker } from './lib/cost-breaker.js';
import { CompletionDetector } from './lib/completion-detector.js';
import { ContinuationDispatcher } from './lib/continuation-dispatcher.js';
import type { PlanParserDeps } from './lib/continuation-dispatcher.js';
import { PlanSync } from './lib/plan-sync.js';
import { pushBetweenWaves } from './lib/between-wave-push.js';
import { createFallbackPr } from './lib/fallback-pr.js';
import { runPlanningPhase } from './lib/planning-orchestrator.js';
import type {
  PromptBuilder,
  PlanParser,
  Ticket,
  ProjectMeta,
} from './lib/planning-orchestrator.js';
import { buildPlanningPrompt, buildExecutionPrompt } from './lib/prompt-builder.js';
import { readAgentsMd } from './lib/agents-md-reader.js';
import { createGitHubClient } from '../lib/github-client.js';

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
// Helper: get git hash-object for package.json (for install re-run detection)
// ---------------------------------------------------------------------------

async function getPackageJsonHash(repoRoot: string): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    // Short fallback timeout so a no-op mock (vi.clearAllMocks) doesn't stall tests
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve('');
      }
    }, 500);
    execFile(
      'git',
      ['-C', repoRoot, 'hash-object', 'package.json'],
      { timeout: 10_000 },
      (err, result) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        if (err) {
          resolve('');
        } else {
          const stdout =
            typeof result === 'object' && result !== null && 'stdout' in result
              ? String((result as { stdout: string }).stdout)
              : String(result);
          resolve(stdout.trim());
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Helper: extract Ticket from TaskRow
// ---------------------------------------------------------------------------

interface JiraPayload {
  issue?: {
    key?: string;
    fields?: {
      summary?: string;
      description?: string;
    };
  };
}

function extractTicketFromTask(task: TaskRow): Ticket {
  const jiraPayload = task.triage_result as JiraPayload | null;
  const issue = jiraPayload?.issue;
  const fields = issue?.fields ?? {};

  const key = issue?.key ?? task.external_id ?? 'TASK-0';
  const summary =
    typeof fields.summary === 'string' ? fields.summary : (task.external_id ?? 'No summary');
  const description =
    typeof fields.description === 'string'
      ? fields.description
      : JSON.stringify(fields.description ?? '');

  return { key, summary, description };
}

// ---------------------------------------------------------------------------
// parseContextFromEnv — reads execution state from disk + env
// ---------------------------------------------------------------------------

interface ParsedContext {
  executionId: string | null;
  postgrestClient: PostgRESTClient;
  task: TaskRow;
  agentVersionId: string | null;
}

async function parseContextFromEnv(): Promise<ParsedContext> {
  const executionIdFile = '/tmp/.execution-id';
  let executionId: string | null = null;
  const envExecutionId = process.env.EXECUTION_ID;
  if (envExecutionId && envExecutionId.trim().length > 0) {
    executionId = envExecutionId.trim();
  } else {
    try {
      const raw = fs.readFileSync(executionIdFile, 'utf8').trim();
      executionId = raw.length > 0 ? raw : null;
    } catch {
      // File missing — proceed without it
    }
  }

  // Create PostgREST client
  const postgrestClient = createPostgRESTClient();

  // Parse task context
  const task = parseTaskContext('/workspace/.task-context.json');
  if (task === null) {
    log.error('[orchestrate] Failed to parse task context — aborting');
    process.exit(1);
  }

  // Ensure agent version
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

  return { executionId, postgrestClient, task, agentVersionId };
}

// ---------------------------------------------------------------------------
// runPreFlight — fetch project config, install, heartbeat, OpenCode server
// ---------------------------------------------------------------------------

interface PreFlightResult {
  projectConfig: ProjectConfig | null;
  toolingConfig: ToolingConfig;
  installCmd: string;
  heartbeat: HeartbeatHandle;
  serverHandle: { url: string; kill: () => Promise<void> };
  sessionManager: SessionManager;
  branchName: string;
}

async function runPreFlight(
  ctx: ParsedContext,
  _config: LongRunningConfig,
): Promise<PreFlightResult> {
  const { executionId, postgrestClient, task, agentVersionId } = ctx;

  // Fetch project config + resolve tooling config
  const projectConfig = await fetchProjectConfig(task.project_id ?? '', postgrestClient);
  const toolingConfig = resolveToolingConfig(projectConfig);
  const installCmd = toolingConfig.install ?? 'pnpm install --frozen-lockfile';

  // Patch execution with starting stage + agent version
  await patchExecution(postgrestClient, executionId, {
    current_stage: 'starting',
    agent_version_id: agentVersionId,
    updated_at: new Date().toISOString(),
  });

  // Run install command
  logStep(log, '🔧', 'Running install command', { installCmd });
  const installStart = Date.now();
  await runInstallCommand({ installCommand: installCmd, cwd: '/workspace' });
  logTool(log, 'install', Date.now() - installStart, 'ok');

  // Start heartbeat
  const heartbeat = startHeartbeat({ executionId, postgrestClient, currentStage: 'starting' });
  heartbeatGlobal = heartbeat;

  // Start OpenCode server
  const serverHandle = await startOpencodeServer({
    port: 4096,
    cwd: '/workspace',
    healthTimeoutMs: 60000,
  });
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

  // Configure OpenRouter provider via REST API (belt-and-suspenders)
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

  // Create session manager
  const sessionManager = createSessionManager(serverHandle.url);

  // Build branch name (needed for between-wave push in phase 2)
  const triageResult = task.triage_result as Record<string, unknown> | null;
  const summary = (triageResult?.summary as string | undefined) ?? task.external_id ?? 'task';
  const branchName = buildBranchName(task.external_id ?? 'TASK-0', summary);

  // Ensure branch exists before any wave push
  const branchResult = await ensureBranch(branchName, '/workspace');
  if (!branchResult.success) {
    log.error(`[orchestrate] Failed to ensure branch: ${branchResult.error ?? 'unknown'}`);
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(1);
  }

  return {
    projectConfig,
    toolingConfig,
    installCmd,
    heartbeat,
    serverHandle,
    sessionManager,
    branchName,
  };
}

// ---------------------------------------------------------------------------
// phase1Planning — Phase 1: AI writes a plan file
// ---------------------------------------------------------------------------

interface Phase1Result {
  planContent: string;
  planPath: string;
}

async function phase1Planning(opts: {
  ctx: ParsedContext;
  config: LongRunningConfig;
  projectConfig: ProjectConfig | null;
  sessionManager: SessionManager;
  heartbeat: HeartbeatHandle;
}): Promise<Phase1Result> {
  const { ctx, config, projectConfig, sessionManager, heartbeat } = opts;
  const { task, executionId, postgrestClient } = ctx;

  logStep(log, '📋', 'Phase 1: Planning started');
  heartbeat.updateStage('planning');
  await patchExecution(postgrestClient, executionId, { current_stage: 'planning' });

  const planPath = `/workspace/.sisyphus/plans/${task.external_id ?? 'TASK-0'}.md`;
  const planSync = new PlanSync({ postgrestClient, logger: log, diskPath: planPath });

  // Task 20: Restart idempotency — load existing plan if present
  const existingPlan = await planSync.loadPlanOnRestart(task.id);
  if (existingPlan) {
    logStep(log, '♻️', 'Plan loaded from prior run', { source: existingPlan.source });
    return { planContent: existingPlan.planContent, planPath };
  }

  // No existing plan — run planning phase
  const ticket = extractTicketFromTask(task);
  const projectMeta: ProjectMeta = {
    repoUrl: projectConfig?.repo_url ?? '',
    name: projectConfig?.name ?? '',
  };

  // Pre-build planning prompt (buildPlanningPrompt is async, PromptBuilder interface is sync)
  const prebuiltPlanningPrompt = await buildPlanningPrompt({
    ticket,
    repoRoot: '/workspace',
    projectMeta,
  });
  const promptBuilder: PromptBuilder = {
    buildPlanningPrompt: () => prebuiltPlanningPrompt,
  };

  const planParser: PlanParser = {
    parsePlanFile: (content) => parsePlan(content),
    validatePlan: (plan) => {
      const hasWaves = plan.waves.length > 0;
      const hasTasks = plan.waves.every((w) => w.tasks.length > 0);
      const errors: string[] = [];
      if (!hasWaves) errors.push('Plan has no waves');
      if (!hasTasks) errors.push('One or more waves have no tasks');
      return { ok: errors.length === 0, errors };
    },
  };

  const { planContent, planPath: resolvedPlanPath } = await runPlanningPhase({
    ticket,
    projectMeta,
    sessionManager,
    config,
    promptBuilder,
    planParser,
    logger: log,
    repoRoot: '/workspace',
  });

  // Save plan to Supabase + disk
  await planSync.savePlanAfterPhase1({
    taskId: task.id,
    planContent,
  });

  return { planContent, planPath: resolvedPlanPath };
}

// ---------------------------------------------------------------------------
// phase2Execution — Phase 2: wave-by-wave code implementation
// ---------------------------------------------------------------------------

interface Phase2Result {
  waves: WaveState[];
}

async function phase2Execution(opts: {
  ctx: ParsedContext;
  config: LongRunningConfig;
  projectConfig: ProjectConfig | null;
  sessionManager: SessionManager;
  heartbeat: HeartbeatHandle;
  planContent: string;
  planPath: string;
  installCmd: string;
  branchName: string;
}): Promise<Phase2Result> {
  const {
    ctx,
    config,
    projectConfig,
    sessionManager,
    heartbeat,
    planContent,
    planPath,
    installCmd,
    branchName,
  } = opts;
  const { task, executionId, postgrestClient } = ctx;

  const plan: ParsedPlan = parsePlan(planContent);
  const costTracker = new CostTrackerV2();
  const costBreaker = new CostBreaker({ config, costTracker });
  const planSync = new PlanSync({ postgrestClient, logger: log, diskPath: planPath });

  // PlanParserDeps adapter for ContinuationDispatcher
  const planParserDeps: PlanParserDeps = {
    parsePlanFile: (content: string) => parsePlan(content),
    findNextUncheckedTasks: (parsed: ParsedPlan, limit: number) =>
      parsed.waves.flatMap((w) => w.tasks.filter((t) => !t.completed)).slice(0, limit),
  };

  // CompletionDetector requires Logger with step() method — adapt pino logger
  const completionLogger = {
    step: (emoji: string, message: string, extras?: Record<string, unknown>) =>
      logStep(log, emoji, message, extras),
    info: (obj: Record<string, unknown>, message: string) => log.info(obj, message),
    warn: (obj: Record<string, unknown>, message: string) => log.warn(obj, message),
    error: (obj: Record<string, unknown>, message: string) => log.error(obj, message),
  };

  const completionDetector = new CompletionDetector({
    sessionManager,
    logger: completionLogger,
    config,
  });

  const continuationDispatcher = new ContinuationDispatcher({
    config,
    planParser: planParserDeps,
    sessionManager,
    logger: log,
  });

  // Task 21: Determine starting wave from DB (restart idempotency)
  let startingWaveNumber = 1;
  if (executionId) {
    try {
      const execResult = await postgrestClient.get(
        'executions',
        `id=eq.${executionId}&select=wave_number`,
      );
      if (execResult && execResult.length > 0) {
        const waveNum = (execResult[0] as Record<string, unknown>).wave_number;
        if (typeof waveNum === 'number' && waveNum > 1) {
          startingWaveNumber = waveNum;
          logStep(log, '♻️', `Resuming from wave ${startingWaveNumber}`);
        }
      }
    } catch (err) {
      log.warn(
        `[orchestrate] Failed to check wave_number for restart: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Track package.json SHA for install re-run detection (Task 23)
  let lastPkgHash = await getPackageJsonHash('/workspace');

  const { owner, repo } = projectConfig
    ? parseRepoOwnerAndName(projectConfig.repo_url)
    : { owner: '', repo: '' };

  const waveStates: WaveState[] = [];
  const totalStart = Date.now();

  logStep(log, '🌊', `Phase 2: Executing ${plan.waves.length} wave(s)`);
  heartbeat.updateStage('executing');
  await patchExecution(postgrestClient, executionId, { current_stage: 'executing' });

  try {
    for (const wave of plan.waves) {
      // Skip waves already processed (restart idempotency)
      if (wave.number < startingWaveNumber) {
        logStep(log, '⏭️', `Skipping wave ${wave.number} (already completed)`);
        continue;
      }

      // Task 24: Cost breaker check — NOT called before wave 1
      if (wave.number > 1) {
        const costResult = costBreaker.shouldStop(wave.number);
        if (costResult.stop) {
          logStep(log, '⛔', `Cost breaker triggered before wave ${wave.number}`, {
            reason: costResult.reason,
            tokensIn: costResult.totals.tokensIn,
            tokensOut: costResult.totals.tokensOut,
          });
          await patchExecution(postgrestClient, executionId, {
            blocked_by: 'cost',
            wave_number: wave.number,
          });
          await escalate({
            executionId,
            taskId: task.id,
            reason: 'blocked_by_cost',
            failedStage: `wave-${wave.number}`,
            postgrestClient,
          });
          break;
        }
      }

      const waveStartMs = Date.now();
      logStep(log, '🌊', `Starting wave ${wave.number}`, { totalWaves: plan.waves.length });
      heartbeat.updateStage(`wave-${wave.number}`);

      // Build wave prompt (Task 21)
      const ticket = extractTicketFromTask(task);
      const agentsMdContent = await readAgentsMd('/workspace', config.agentsMdMaxChars);
      const wavePrompt = await buildExecutionPrompt({
        ticket,
        repoRoot: '/workspace',
        projectMeta: {
          repoUrl: projectConfig?.repo_url ?? '',
          name: projectConfig?.name ?? '',
        },
        wave,
        planPath,
        agentsMdContent,
        boulderContext: null,
      });

      // Create session for this wave
      const sessionId = await sessionManager.createSession(`Wave ${wave.number}`);
      if (!sessionId) {
        const ws: WaveState = {
          number: wave.number,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          status: 'failed',
          error: `Failed to create session for wave ${wave.number}`,
        };
        waveStates.push(ws);

        // Task 26: Plan sync on failure
        if (executionId) {
          await planSync.updateWaveState({
            executionId,
            waveNumber: wave.number,
            waveState: { waves: waveStates },
          });
        }

        throw new Error(`Wave ${wave.number} failed: could not create session`);
      }

      await sessionManager.injectTaskPrompt(sessionId, wavePrompt);

      // Task 22: Completion detection + continuation loop
      // continuationCount MUST reset to 0 at each wave boundary
      let continuationCount = 0;
      const waveTimeoutMs = 90 * 60 * 1000; // 90 min per wave

      let waveCompleted = false;
      while (true) {
        const completionResult = await completionDetector.waitForCompletion({
          sessionId,
          waveNumber: wave.number,
          timeoutMs: waveTimeoutMs,
        });

        if (completionResult.outcome === 'completed') {
          waveCompleted = true;
          break;
        }

        if (completionResult.outcome === 'idle') {
          // Task 22: Max 5 continuations per wave
          if (continuationCount >= config.maxContinuationsPerWave) {
            logStep(log, '⚠️', `Max continuations (${config.maxContinuationsPerWave}) reached`, {
              waveNumber: wave.number,
              continuationCount,
            });
            break;
          }

          // Read current plan state for continuation prompt
          let currentPlanContent = planContent;
          try {
            currentPlanContent = await readFile(planPath, 'utf8');
          } catch {
            log.warn('[orchestrate] Failed to read plan for continuation — using initial');
          }

          const dispatchResult = await continuationDispatcher.dispatchContinuation({
            waveNumber: wave.number,
            sessionId,
            planContent: currentPlanContent,
            continuationCount,
          });

          continuationCount++;

          if (!dispatchResult.dispatched) {
            // Dispatcher reported all tasks checked or max reached
            waveCompleted = dispatchResult.reason === 'all tasks checked';
            break;
          }

          // Task 22: Loop back to waitForCompletion
          continue;
        }

        // timeout or error — exit loop
        break;
      }

      // Check wave task completion in plan file
      let allTasksCompleted = false;
      try {
        const freshPlanContent = await readFile(planPath, 'utf8');
        const freshPlan = parsePlan(freshPlanContent);
        const freshWave = freshPlan.waves.find((w) => w.number === wave.number);
        if (freshWave) {
          allTasksCompleted = freshWave.tasks.every((t) => t.completed);
        } else {
          log.warn(`[orchestrate] Wave ${wave.number} not found in re-read plan`);
        }
      } catch (err) {
        log.warn(
          `[orchestrate] Failed to re-read plan after wave ${wave.number}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      const waveStatus: WaveState['status'] =
        allTasksCompleted || waveCompleted ? 'completed' : 'failed';
      const ws: WaveState = {
        number: wave.number,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: waveStatus,
        error: waveStatus === 'failed' ? `Not all tasks completed in wave ${wave.number}` : null,
      };
      waveStates.push(ws);

      // Task 26: Plan sync after each wave (success or fail)
      if (executionId) {
        await planSync.updateWaveState({
          executionId,
          waveNumber: wave.number,
          waveState: { waves: waveStates },
        });
      }

      // Task 27: Log wave timing and cost
      const waveElapsedMs = Date.now() - waveStartMs;
      logTiming(log, `wave-${wave.number}`, waveElapsedMs, Date.now() - totalStart);
      const waveTotals = costTracker.getWaveTotals(wave.number);
      logCost(log, waveTotals.tokensIn, waveTotals.tokensOut);

      if (waveStatus === 'failed') {
        logStep(log, '❌', `Wave ${wave.number} failed — stopping`, {
          error: ws.error,
        });
        throw new Error(`Wave ${wave.number} failed: ${ws.error}`);
      }

      logStep(log, '✅', `Wave ${wave.number} completed`, { waveElapsedMs });

      // Task 23: Re-run install if package.json changed
      const currentPkgHash = await getPackageJsonHash('/workspace');
      if (currentPkgHash && currentPkgHash !== lastPkgHash) {
        logStep(log, '🔧', 'package.json changed — re-running install');
        const reInstallStart = Date.now();
        await runInstallCommand({ installCommand: installCmd, cwd: '/workspace' });
        logTool(log, 're-install', Date.now() - reInstallStart, 'ok');
        lastPkgHash = currentPkgHash;
      }

      // Task 23: Between-wave push after every successful wave
      if (owner && repo) {
        const waveDesc = wave.tasks
          .map((t) => t.title)
          .join(', ')
          .slice(0, 80);
        const pushStart = Date.now();
        await pushBetweenWaves({
          repoRoot: '/workspace',
          branchName,
          waveNumber: wave.number,
          waveDescription: waveDesc,
          logger: log,
        });
        logTool(log, 'git-push', Date.now() - pushStart, 'ok');
      }
    }
  } catch (err) {
    // Task 25: Fallback PR on wave failure
    if (config.fallbackPrEnabled && owner && repo && process.env.GITHUB_TOKEN) {
      try {
        const githubClient = createGitHubClient({ token: process.env.GITHUB_TOKEN });

        const ticket = extractTicketFromTask(task);
        const completedWaveNums = waveStates
          .filter((ws) => ws.status === 'completed')
          .map((ws) => ws.number);
        const lastFailedWave =
          [...waveStates].reverse().find((ws) => ws.status === 'failed')?.number ?? null;

        await createFallbackPr({
          githubClient,
          repoOwner: owner,
          repoName: repo,
          branchName,
          ticket,
          completedWaves: completedWaveNums,
          failedWave: lastFailedWave,
          error: err instanceof Error ? err : new Error(String(err)),
          logger: log,
          repoRoot: '/workspace',
        });
      } catch (fallbackErr) {
        log.warn(
          `[orchestrate] Fallback PR creation failed: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}`,
        );
      }
    }

    // Task 25: Rethrow original error AFTER fallback PR
    throw err;
  }

  logTiming(log, 'phase2-execution', Date.now() - totalStart, Date.now() - totalStart);
  return { waves: waveStates };
}

// ---------------------------------------------------------------------------
// finalize — fix-loop safety net + PR creation + completion flow
// ---------------------------------------------------------------------------

interface FinalizeOpts {
  ctx: ParsedContext;
  projectConfig: ProjectConfig | null;
  toolingConfig: ToolingConfig;
  sessionManager: SessionManager;
  heartbeat: HeartbeatHandle;
  serverHandle: { url: string; kill: () => Promise<void> };
  branchName: string;
  tokenTracker: TokenTracker;
}

async function finalize(opts: FinalizeOpts): Promise<void> {
  const {
    ctx,
    projectConfig,
    toolingConfig,
    sessionManager,
    heartbeat,
    serverHandle,
    branchName,
    tokenTracker,
  } = opts;
  const { task, executionId, postgrestClient } = ctx;

  const finalizeStart = Date.now();

  // ── Step: Build prompt for fix-loop session ──────────────────────────────
  const prompt = await buildPrompt(task);

  // ── Step: Create session for fix-loop ────────────────────────────────────
  const sessionId = await sessionManager.createSession(`Task ${task.external_id}`);
  if (sessionId === null) {
    log.error('[orchestrate] Failed to create OpenCode session for fix-loop');
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(1);
  }
  await sessionManager.injectTaskPrompt(sessionId, prompt);

  // ── Step: Monitor session (wait for code generation to complete) ─────────
  heartbeat.updateStage('executing');
  await patchExecution(postgrestClient, executionId, { current_stage: 'executing' });

  const codeGenTimeoutMins = parseInt(process.env.ORCHESTRATE_TIMEOUT_MINS ?? '60', 10);
  const monitorResult = await sessionManager.monitorSession(sessionId, {
    timeoutMs: codeGenTimeoutMins * 60 * 1000,
  });
  if (!monitorResult.completed) {
    const reason = monitorResult.reason === 'error' ? 'session error' : 'timeout';
    log.error(`[orchestrate] Session failed during code generation: ${reason}`);
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(1);
  }

  // ── Step: Run fix loop (validation pipeline + automatic fixes) ───────────
  heartbeat.updateStage('validating');
  await patchExecution(postgrestClient, executionId, { current_stage: 'validating' });
  logStep(log, '🔧', 'Running fix loop (validation + auto-fix)');

  const fixResult = await runWithFixLoop({
    sessionId,
    sessionManager,
    executionId,
    toolingConfig,
    postgrestClient,
    heartbeat,
    taskId: task.id,
  });

  logTiming(log, 'fix-loop', Date.now() - finalizeStart, Date.now() - finalizeStart);

  if (fixResult.success) {
    heartbeat.updateStage('completing');
    await patchExecution(postgrestClient, executionId, { current_stage: 'completing' });

    const { owner, repo } = projectConfig
      ? parseRepoOwnerAndName(projectConfig.repo_url)
      : { owner: '', repo: '' };
    const defaultBranch = projectConfig?.default_branch ?? 'main';

    // ── Commit and push changes ───────────────────────────────────────────
    const triageResult = task.triage_result as Record<string, unknown> | null;
    const summary = (triageResult?.summary as string | undefined) ?? task.external_id ?? 'task';
    const commitMessage = `feat: ${task.external_id} - ${summary}`;

    const pushStart = Date.now();
    const pushResult = await commitAndPush(branchName, commitMessage, '/workspace');
    logTool(log, 'git-push-final', Date.now() - pushStart, pushResult.error ? 'error' : 'ok');

    if (pushResult.error) {
      log.error(`[orchestrate] Push failed: ${pushResult.error}`);
      heartbeat.stop();
      await serverHandle.kill();
      process.exit(1);
    }

    // ── Create or update PR ──────────────────────────────────────────────
    let prUrl: string | null = null;
    if (!pushResult.error && owner && repo) {
      const githubToken = process.env.GITHUB_TOKEN;
      if (githubToken) {
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

    // ── Persist token counts ──────────────────────────────────────────────
    const accumulated = tokenTracker.getAccumulated();
    if (accumulated.promptTokens > 0 || accumulated.completionTokens > 0) {
      await patchExecution(postgrestClient, executionId, {
        prompt_tokens: accumulated.promptTokens,
        completion_tokens: accumulated.completionTokens,
        estimated_cost_usd: accumulated.estimatedCostUsd,
        primary_model_id: accumulated.primaryModelId || null,
      });
    }

    // ── Run completion flow (Supabase-first, non-negotiable ordering) ────
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

    logStep(log, '✅', `Task ${task.external_id} completed successfully`);
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(0);
  } else {
    // Fix loop failed — persist partial token counts before exit
    const accumulatedOnFailure = tokenTracker.getAccumulated();
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

// ---------------------------------------------------------------------------
// Main orchestration flow
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const tokenTracker = new TokenTracker();
  const orchestrateStart = Date.now();

  // ── Step 1: Parse context from environment ───────────────────────────────
  logStep(log, '🚀', 'Orchestration starting');
  const ctx = await parseContextFromEnv();

  // ── Step 2: Read configuration ───────────────────────────────────────────
  const config = readConfigFromEnv();

  // ── Step 3: Pre-flight ───────────────────────────────────────────────────
  logStep(log, '🛫', 'Running pre-flight checks');
  const preFlightResult = await runPreFlight(ctx, config);
  const {
    projectConfig,
    toolingConfig,
    installCmd,
    heartbeat,
    serverHandle,
    sessionManager,
    branchName,
  } = preFlightResult;

  logTiming(log, 'pre-flight', Date.now() - orchestrateStart, Date.now() - orchestrateStart);

  try {
    // ── Step 4: Phase 1 — Planning ──────────────────────────────────────────
    const { planContent, planPath } = await phase1Planning({
      ctx,
      config,
      projectConfig,
      sessionManager,
      heartbeat,
    });

    logTiming(log, 'planning-phase', Date.now() - orchestrateStart, Date.now() - orchestrateStart);

    // ── Step 5: Phase 2 — Wave execution ────────────────────────────────────
    await phase2Execution({
      ctx,
      config,
      projectConfig,
      sessionManager,
      heartbeat,
      planContent,
      planPath,
      installCmd,
      branchName,
    });

    logTiming(log, 'execution-phase', Date.now() - orchestrateStart, Date.now() - orchestrateStart);

    // ── Step 6: Finalize (fix-loop safety net + PR + completion) ────────────
    logStep(log, '🏁', 'Finalizing: fix-loop + PR + completion');
    await finalize({
      ctx,
      projectConfig,
      toolingConfig,
      sessionManager,
      heartbeat,
      serverHandle,
      branchName,
      tokenTracker,
    });
  } catch (err) {
    // Re-throw EXIT signals (thrown by process.exit mock in tests) — do not double-handle
    if (err instanceof Error && /^EXIT_/.test(err.message)) throw err;
    // phase2Execution already created fallback PR if enabled
    log.error(
      `[orchestrate] Fatal error in orchestration: ${err instanceof Error ? err.message : String(err)}`,
    );
    heartbeat.stop();
    await serverHandle.kill();
    process.exit(1);
  }
}

// Export main for direct invocation in tests (avoids vi.resetModules() factory-instance issues)
export { main };

// Auto-run only outside of test environments
if (!process.env.VITEST) {
  main().catch((err: unknown) => {
    log.error(`[orchestrate] Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
