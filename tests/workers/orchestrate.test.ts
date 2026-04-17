import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostgRESTClient } from '../../src/workers/lib/postgrest-client.js';
import type { HeartbeatHandle } from '../../src/workers/lib/heartbeat.js';
import { main } from '../../src/workers/orchestrate.mjs';

process.setMaxListeners(100);

// ============================================================================
// STABLE HOISTED MOCK INSTANCES — persist across vi.restoreAllMocks() + resetModules()
// ============================================================================

const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

const mockPlanContent = vi.hoisted(
  () =>
    '# TEST-001 — Test task\n\nTest plan content.\n\n## Wave 1\n\n' +
    '- [ ] 1. Implement feature\n- [ ] 2. Write tests\n\n' +
    'Padding content to meet minimum 500 byte requirement. '.repeat(10),
);

// --- fs / node:fs/promises / node:child_process / node:util ---
const mockReadFileSync = vi.hoisted(vi.fn);
const mockReadFile = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve(
      '# TEST-001\n\nTest plan.\n\n## Wave 1\n\n' +
        '- [ ] 1. Task one\n- [ ] 2. Task two\n\n' +
        'Additional content to pad to minimum size. '.repeat(15),
    ),
  ),
);

const mockExecFile = vi.hoisted(() =>
  vi.fn().mockImplementation((_cmd: unknown, _args: unknown, _opts: unknown, callback: unknown) => {
    if (typeof callback === 'function') {
      (callback as (err: Error | null, result: unknown) => void)(null, {
        stdout: 'abc123def456\n',
        stderr: '',
      });
    }
    return {};
  }),
);

const mockPromisify = vi.hoisted(() =>
  vi.fn().mockImplementation((fn: (...args: unknown[]) => void) => {
    return (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        fn(...args, (err: Error | null, result: unknown) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
  }),
);

// --- workers/lib modules ---
const mockParseTaskContext = vi.hoisted(vi.fn);
const mockBuildPrompt = vi.hoisted(vi.fn);
const mockResolveToolingConfig = vi.hoisted(vi.fn);
const mockStartOpencodeServer = vi.hoisted(vi.fn);
const mockCreateSessionManager = vi.hoisted(vi.fn);
const mockRunWithFixLoop = vi.hoisted(vi.fn);
const mockStartHeartbeat = vi.hoisted(vi.fn);
const mockEscalate = vi.hoisted(vi.fn);
const mockBuildBranchName = vi.hoisted(vi.fn);
const mockEnsureBranch = vi.hoisted(vi.fn);
const mockCommitAndPush = vi.hoisted(vi.fn);
const mockCreateOrUpdatePR = vi.hoisted(vi.fn);
const mockRunCompletionFlow = vi.hoisted(vi.fn);
const mockRunInstallCommand = vi.hoisted(vi.fn);
const mockFetchProjectConfig = vi.hoisted(vi.fn);
const mockParseRepoOwnerAndName = vi.hoisted(vi.fn);
const mockReadAgentsMd = vi.hoisted(vi.fn);
const mockPushBetweenWaves = vi.hoisted(vi.fn);
const mockCreateFallbackPr = vi.hoisted(vi.fn);
const mockBuildPlanningPrompt = vi.hoisted(vi.fn);
const mockBuildExecutionPrompt = vi.hoisted(vi.fn);
const mockComputeVersionHash = vi.hoisted(vi.fn);
const mockEnsureAgentVersion = vi.hoisted(vi.fn);
const mockRunPlanningPhase = vi.hoisted(vi.fn);
const mockParsePlan = vi.hoisted(vi.fn);
const mockGetNextIncompleteWave = vi.hoisted(vi.fn);
const mockIsPlanComplete = vi.hoisted(vi.fn);
const mockReadConfigFromEnv = vi.hoisted(vi.fn);

// --- classes ---
const mockTokenTrackerCtor = vi.hoisted(vi.fn);
const mockPlanSyncCtor = vi.hoisted(vi.fn);
const mockCostTrackerV2Ctor = vi.hoisted(vi.fn);
const mockCostBreakerCtor = vi.hoisted(vi.fn);
const mockCompletionDetectorCtor = vi.hoisted(vi.fn);
const mockContinuationDispatcherCtor = vi.hoisted(vi.fn);
const mockWaveExecutorCtor = vi.hoisted(vi.fn);
const mockRunAllWaves = vi.hoisted(vi.fn);

// --- github-client ---
const mockCreateGitHubClient = vi.hoisted(vi.fn);

// --- postgrest-client ---
const mockCreatePostgRESTClient = vi.hoisted(vi.fn);

// ============================================================================
// VI.MOCK() FACTORIES — return references to hoisted instances
// ============================================================================

vi.mock('../../src/lib/logger.js', () => ({
  createLogger: () => mockLogger,
  taskLogger: () => mockLogger,
  logStep: vi.fn(),
  logTiming: vi.fn(),
  logTool: vi.fn(),
  logCost: vi.fn(),
}));

vi.mock('fs', () => ({
  readFileSync: mockReadFileSync,
}));

vi.mock('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

vi.mock('node:child_process', () => ({
  execFile: mockExecFile,
}));

vi.mock('node:util', () => ({
  promisify: mockPromisify,
}));

vi.mock('../../src/workers/lib/postgrest-client.js', () => ({
  createPostgRESTClient: mockCreatePostgRESTClient,
}));

vi.mock('../../src/workers/lib/task-context.js', () => ({
  parseTaskContext: mockParseTaskContext,
  buildPrompt: mockBuildPrompt,
  resolveToolingConfig: mockResolveToolingConfig,
}));

vi.mock('../../src/workers/lib/opencode-server.js', () => ({
  startOpencodeServer: mockStartOpencodeServer,
}));

vi.mock('../../src/workers/lib/session-manager.js', () => ({
  createSessionManager: mockCreateSessionManager,
}));

vi.mock('../../src/workers/lib/fix-loop.js', () => ({
  runWithFixLoop: mockRunWithFixLoop,
}));

vi.mock('../../src/workers/lib/heartbeat.js', () => ({
  startHeartbeat: mockStartHeartbeat,
  escalate: mockEscalate,
}));

vi.mock('../../src/workers/lib/branch-manager.js', () => ({
  buildBranchName: mockBuildBranchName,
  ensureBranch: mockEnsureBranch,
  commitAndPush: mockCommitAndPush,
}));

vi.mock('../../src/workers/lib/pr-manager.js', () => ({
  createOrUpdatePR: mockCreateOrUpdatePR,
}));

vi.mock('../../src/workers/lib/completion.js', () => ({
  runCompletionFlow: mockRunCompletionFlow,
}));

vi.mock('../../src/workers/lib/install-runner.js', () => ({
  runInstallCommand: mockRunInstallCommand,
}));

vi.mock('../../src/workers/lib/project-config.js', () => ({
  fetchProjectConfig: mockFetchProjectConfig,
  parseRepoOwnerAndName: mockParseRepoOwnerAndName,
}));

vi.mock('../../src/workers/lib/token-tracker.js', () => ({
  TokenTracker: mockTokenTrackerCtor,
}));

vi.mock('../../src/lib/agent-version.js', () => ({
  computeVersionHash: mockComputeVersionHash,
  ensureAgentVersion: mockEnsureAgentVersion,
}));

vi.mock('../../src/workers/lib/plan-sync.js', () => ({
  PlanSync: mockPlanSyncCtor,
}));

vi.mock('../../src/workers/lib/planning-orchestrator.js', () => ({
  runPlanningPhase: mockRunPlanningPhase,
}));

vi.mock('../../src/workers/lib/plan-parser.js', () => ({
  parsePlan: mockParsePlan,
  getNextIncompleteWave: mockGetNextIncompleteWave,
  isPlanComplete: mockIsPlanComplete,
}));

vi.mock('../../src/workers/lib/cost-tracker-v2.js', () => ({
  CostTrackerV2: mockCostTrackerV2Ctor,
}));

vi.mock('../../src/workers/lib/cost-breaker.js', () => ({
  CostBreaker: mockCostBreakerCtor,
}));

vi.mock('../../src/workers/lib/completion-detector.js', () => ({
  CompletionDetector: mockCompletionDetectorCtor,
}));

vi.mock('../../src/workers/lib/continuation-dispatcher.js', () => ({
  ContinuationDispatcher: mockContinuationDispatcherCtor,
}));

vi.mock('../../src/workers/lib/wave-executor.js', () => ({
  WaveExecutor: mockWaveExecutorCtor,
  runAllWaves: mockRunAllWaves,
}));

vi.mock('../../src/workers/lib/between-wave-push.js', () => ({
  pushBetweenWaves: mockPushBetweenWaves,
}));

vi.mock('../../src/workers/lib/fallback-pr.js', () => ({
  createFallbackPr: mockCreateFallbackPr,
}));

vi.mock('../../src/workers/lib/prompt-builder.js', () => ({
  buildPlanningPrompt: mockBuildPlanningPrompt,
  buildExecutionPrompt: mockBuildExecutionPrompt,
}));

vi.mock('../../src/workers/lib/agents-md-reader.js', () => ({
  readAgentsMd: mockReadAgentsMd,
}));

vi.mock('../../src/lib/github-client.js', () => ({
  createGitHubClient: mockCreateGitHubClient,
}));

vi.mock('../../src/workers/config/long-running.js', () => ({
  readConfigFromEnv: mockReadConfigFromEnv,
}));

// ============================================================================
// IMPORTS — typed using hoisted mock references
// ============================================================================

import * as fs from 'fs';
import { createPostgRESTClient } from '../../src/workers/lib/postgrest-client.js';
import {
  parseTaskContext,
  buildPrompt,
  resolveToolingConfig,
} from '../../src/workers/lib/task-context.js';
import { startOpencodeServer } from '../../src/workers/lib/opencode-server.js';
import { createSessionManager } from '../../src/workers/lib/session-manager.js';
import { runWithFixLoop } from '../../src/workers/lib/fix-loop.js';
import { startHeartbeat, escalate } from '../../src/workers/lib/heartbeat.js';
import {
  buildBranchName,
  ensureBranch,
  commitAndPush,
} from '../../src/workers/lib/branch-manager.js';
import { createOrUpdatePR } from '../../src/workers/lib/pr-manager.js';
import { runCompletionFlow } from '../../src/workers/lib/completion.js';
import { fetchProjectConfig, parseRepoOwnerAndName } from '../../src/workers/lib/project-config.js';
import { TokenTracker } from '../../src/workers/lib/token-tracker.js';
import { computeVersionHash } from '../../src/lib/agent-version.js';
import { runPlanningPhase } from '../../src/workers/lib/planning-orchestrator.js';
import { PlanSync } from '../../src/workers/lib/plan-sync.js';
import { parsePlan } from '../../src/workers/lib/plan-parser.js';
import { CostBreaker } from '../../src/workers/lib/cost-breaker.js';
import { CompletionDetector } from '../../src/workers/lib/completion-detector.js';
import { ContinuationDispatcher } from '../../src/workers/lib/continuation-dispatcher.js';
import { pushBetweenWaves } from '../../src/workers/lib/between-wave-push.js';
import { createFallbackPr } from '../../src/workers/lib/fallback-pr.js';
import { readFile } from 'node:fs/promises';
import { createGitHubClient } from '../../src/lib/github-client.js';

// ============================================================================
// DEFAULT MOCK RETURN VALUES — applied in beforeEach, reset after each test
// ============================================================================

function applyDefaultMockValues() {
  // Always-available mocks that most tests need
  mockReadFileSync.mockReturnValue('exec-id-123');
  mockParseTaskContext.mockReturnValue({
    id: 'task-1',
    external_id: 'TEST-001',
    status: 'Executing',
    triage_result: null,
    requirements: null,
    project_id: 'proj-1',
  });
  mockBuildPrompt.mockResolvedValue('Build this feature...');
  mockResolveToolingConfig.mockReturnValue({});
  mockStartOpencodeServer.mockResolvedValue({
    url: 'http://localhost:4096',
    process: {} as import('child_process').ChildProcess,
    kill: vi.fn().mockResolvedValue(undefined),
  });
  mockCreateSessionManager.mockReturnValue({
    createSession: vi.fn().mockResolvedValue('sess-1'),
    injectTaskPrompt: vi.fn().mockResolvedValue(true),
    monitorSession: vi.fn().mockResolvedValue({ completed: true, reason: 'idle' }),
    abortSession: vi.fn(),
    sendFixPrompt: vi.fn(),
  });
  mockStartHeartbeat.mockReturnValue({
    stop: vi.fn(),
    updateStage: vi.fn(),
  });
  mockRunWithFixLoop.mockResolvedValue({ success: true, totalIterations: 0 });

  mockFetchProjectConfig.mockResolvedValue({
    id: 'proj-1',
    name: 'test',
    repo_url: 'https://github.com/org/repo',
    default_branch: 'main',
    tooling_config: null,
  });
  mockParseRepoOwnerAndName.mockReturnValue({ owner: 'org', repo: 'repo' });
  mockBuildBranchName.mockReturnValue('ai/PROJ-1-test-task');
  mockEnsureBranch.mockResolvedValue({ success: true, existed: false });
  mockCommitAndPush.mockResolvedValue({ pushed: true });
  mockCreateOrUpdatePR.mockResolvedValue({
    pr: {
      html_url: 'https://github.com/org/repo/pull/1',
      number: 1,
      title: '[AI] TEST-001',
      head: { ref: 'ai/PROJ-1-test-task' },
      base: { ref: 'main' },
      state: 'open',
    },
    wasExisting: false,
  });
  mockRunCompletionFlow.mockResolvedValue({ supabaseWritten: true, inngestSent: true });
  mockRunInstallCommand.mockResolvedValue(undefined);

  mockComputeVersionHash.mockReturnValue({
    promptHash: 'mock-prompt-hash',
    modelId: 'minimax/minimax-m2.7',
    toolConfigHash: 'mock-tool-config-hash',
  });
  mockEnsureAgentVersion.mockResolvedValue(undefined);

  mockPlanSyncCtor.mockImplementation(
    () =>
      ({
        loadPlanOnRestart: vi.fn().mockResolvedValue(null),
        savePlanAfterPhase1: vi.fn().mockResolvedValue(undefined),
        updateWaveState: vi.fn().mockResolvedValue(undefined),
      }) as unknown as InstanceType<typeof PlanSync>,
  );

  mockRunPlanningPhase.mockResolvedValue({
    planContent: mockPlanContent,
    planPath: '/workspace/.sisyphus/plans/TEST-001.md',
  });

  mockParsePlan.mockReturnValue({
    waves: [
      {
        number: 1,
        tasks: [
          { number: 1, title: 'Implement feature', completed: true },
          { number: 2, title: 'Write tests', completed: true },
        ],
      },
    ],
    totalWaves: 1,
    totalTasks: 2,
    completedTasks: 2,
  });
  mockGetNextIncompleteWave.mockReturnValue(null);
  mockIsPlanComplete.mockReturnValue(true);

  mockCompletionDetectorCtor.mockImplementation(
    () =>
      ({
        waitForCompletion: vi
          .fn()
          .mockResolvedValue({ outcome: 'completed', reason: 'SSE', idleCount: 0 }),
      }) as unknown as InstanceType<typeof CompletionDetector>,
  );

  mockCostBreakerCtor.mockImplementation(
    () =>
      ({
        shouldStop: vi.fn().mockReturnValue({
          stop: false,
          reason: 'within cap',
          totals: { tokensIn: 0, tokensOut: 0 },
        }),
      }) as unknown as InstanceType<typeof CostBreaker>,
  );

  mockContinuationDispatcherCtor.mockImplementation(
    () =>
      ({
        dispatchContinuation: vi
          .fn()
          .mockResolvedValue({ dispatched: false, reason: 'all tasks checked' }),
      }) as unknown as InstanceType<typeof ContinuationDispatcher>,
  );

  mockTokenTrackerCtor.mockImplementation(
    () =>
      ({
        addUsage: vi.fn(),
        getAccumulated: vi.fn().mockReturnValue({
          promptTokens: 0,
          completionTokens: 0,
          estimatedCostUsd: 0,
          primaryModelId: '',
        }),
        reset: vi.fn(),
      }) as unknown as InstanceType<typeof TokenTracker>,
  );

  mockCreatePostgRESTClient.mockReturnValue({
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ id: 'mock-agent-version-id' }),
    patch: vi.fn().mockResolvedValue({}),
  } as unknown as PostgRESTClient);

  mockReadAgentsMd.mockResolvedValue(null);
  mockReadFile.mockResolvedValue(mockPlanContent as unknown as never);
  mockPushBetweenWaves.mockResolvedValue({ pushed: true, commitSha: 'abc123' });
  mockCreateFallbackPr.mockResolvedValue({
    created: true,
    prUrl: 'https://github.com/org/repo/pull/99',
    reason: 'draft PR created',
  });
  mockBuildPlanningPrompt.mockResolvedValue('planning prompt content');
  mockBuildExecutionPrompt.mockResolvedValue('wave execution prompt content');

  vi.mocked(createGitHubClient).mockReturnValue({
    createPR: vi
      .fn()
      .mockResolvedValue({ html_url: 'https://github.com/org/repo/pull/1', number: 1 }),
    listPRs: vi.fn().mockResolvedValue([]),
    getPR: vi.fn().mockResolvedValue(null),
  });

  mockReadConfigFromEnv.mockReturnValue({
    orchestrateTimeoutMs: 14400000,
    completionTimeoutMs: 21600000,
    totalTimeoutMs: 28800000,
    planningTimeoutMs: 1800000,
    maxContinuationsPerWave: 5,
    maxWavesPerTask: 20,
    minDiskSpaceBytes: 2147483648,
    agentsMdMaxChars: 8000,
    heartbeatIntervalMs: 60000,
    watchdogStaleThresholdMs: 1200000,
    fallbackPrEnabled: true,
    costBreakerTokenCap: 4000000,
  });

  // Wave executor
  mockWaveExecutorCtor.mockImplementation(
    () =>
      ({
        executeWave: vi.fn(),
      }) as unknown as InstanceType<
        typeof import('../../src/workers/lib/wave-executor.js').WaveExecutor
      >,
  );
  mockRunAllWaves.mockResolvedValue(undefined);

  mockCostTrackerV2Ctor.mockImplementation(
    () =>
      ({
        recordStep: vi.fn(),
        getWaveTotals: vi.fn().mockReturnValue({ tokensIn: 0, tokensOut: 0 }),
        getTaskTotals: vi.fn().mockReturnValue({ tokensIn: 0, tokensOut: 0 }),
        reset: vi.fn(),
      }) as unknown as InstanceType<
        typeof import('../../src/workers/lib/cost-tracker-v2.js').CostTrackerV2
      >,
  );
}

function createMockPostgRESTClient(): PostgRESTClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({ id: 'mock-agent-version-id' }),
    patch: vi.fn().mockResolvedValue({}),
  };
}

function createMockHeartbeat(): HeartbeatHandle {
  return {
    stop: vi.fn(),
    updateStage: vi.fn(),
  };
}

function createMockServerHandle() {
  return {
    url: 'http://localhost:4096',
    process: {} as unknown as import('child_process').ChildProcess,
    kill: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockSessionManager() {
  return {
    createSession: vi.fn().mockResolvedValue('sess-1'),
    injectTaskPrompt: vi.fn().mockResolvedValue(true),
    monitorSession: vi.fn().mockResolvedValue({ completed: true, reason: 'idle' }),
    abortSession: vi.fn(),
    sendFixPrompt: vi.fn(),
  };
}

function createMockTask() {
  return {
    id: 'task-1',
    external_id: 'TEST-001',
    status: 'Executing',
    triage_result: null,
    requirements: null,
    project_id: 'proj-1',
  };
}

function createMockTokenTracker() {
  return {
    addUsage: vi.fn(),
    getAccumulated: vi.fn().mockReturnValue({
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      primaryModelId: '',
    }),
    reset: vi.fn(),
  };
}

function setupHappyPath() {
  const mockHeartbeat = createMockHeartbeat();
  const mockServerHandle = createMockServerHandle();
  const mockSessionManager = createMockSessionManager();
  const mockPostgREST = createMockPostgRESTClient();
  const mockTask = createMockTask();
  const mockTokenTracker = createMockTokenTracker();

  vi.mocked(computeVersionHash).mockReturnValue({
    promptHash: 'mock-prompt-hash',
    modelId: 'minimax/minimax-m2.7',
    toolConfigHash: 'mock-tool-config-hash',
  });

  vi.mocked(TokenTracker).mockImplementation(
    () => mockTokenTracker as unknown as InstanceType<typeof TokenTracker>,
  );

  vi.mocked(fs.readFileSync).mockReturnValue('exec-id-123');
  vi.mocked(createPostgRESTClient).mockReturnValue(mockPostgREST);
  vi.mocked(parseTaskContext).mockReturnValue(mockTask);
  vi.mocked(buildPrompt).mockResolvedValue('Build this feature...');
  vi.mocked(resolveToolingConfig).mockReturnValue({});
  vi.mocked(startOpencodeServer).mockResolvedValue(mockServerHandle);
  vi.mocked(createSessionManager).mockReturnValue(mockSessionManager);
  vi.mocked(startHeartbeat).mockReturnValue(mockHeartbeat);
  vi.mocked(runWithFixLoop).mockResolvedValue({ success: true, totalIterations: 0 });

  vi.mocked(fetchProjectConfig).mockResolvedValue({
    id: 'proj-1',
    name: 'test',
    repo_url: 'https://github.com/org/repo',
    default_branch: 'main',
    tooling_config: null,
  });
  vi.mocked(parseRepoOwnerAndName).mockReturnValue({ owner: 'org', repo: 'repo' });
  vi.mocked(buildBranchName).mockReturnValue('ai/PROJ-1-test-task');
  vi.mocked(ensureBranch).mockResolvedValue({ success: true, existed: false });
  vi.mocked(commitAndPush).mockResolvedValue({ pushed: true });
  vi.mocked(createOrUpdatePR).mockResolvedValue({
    pr: {
      html_url: 'https://github.com/org/repo/pull/1',
      number: 1,
      title: '[AI] TEST-001',
      head: { ref: 'ai/PROJ-1-test-task' },
      base: { ref: 'main' },
      state: 'open',
    },
    wasExisting: false,
  });
  vi.mocked(runCompletionFlow).mockResolvedValue({ supabaseWritten: true, inngestSent: true });

  vi.mocked(PlanSync).mockImplementation(
    () =>
      ({
        loadPlanOnRestart: vi.fn().mockResolvedValue(null),
        savePlanAfterPhase1: vi.fn().mockResolvedValue(undefined),
        updateWaveState: vi.fn().mockResolvedValue(undefined),
      }) as unknown as InstanceType<typeof PlanSync>,
  );

  vi.mocked(runPlanningPhase).mockResolvedValue({
    planContent: mockPlanContent,
    planPath: '/workspace/.sisyphus/plans/TEST-001.md',
  });

  vi.mocked(parsePlan).mockReturnValue({
    waves: [
      {
        number: 1,
        tasks: [
          { number: 1, title: 'Implement feature', completed: true },
          { number: 2, title: 'Write tests', completed: true },
        ],
      },
    ],
    totalWaves: 1,
    totalTasks: 2,
    completedTasks: 2,
  });

  vi.mocked(CompletionDetector).mockImplementation(
    () =>
      ({
        waitForCompletion: vi
          .fn()
          .mockResolvedValue({ outcome: 'completed', reason: 'SSE', idleCount: 0 }),
      }) as unknown as InstanceType<typeof CompletionDetector>,
  );

  vi.mocked(CostBreaker).mockImplementation(
    () =>
      ({
        shouldStop: vi.fn().mockReturnValue({
          stop: false,
          reason: 'within cap',
          totals: { tokensIn: 0, tokensOut: 0 },
        }),
      }) as unknown as InstanceType<typeof CostBreaker>,
  );

  vi.mocked(ContinuationDispatcher).mockImplementation(
    () =>
      ({
        dispatchContinuation: vi
          .fn()
          .mockResolvedValue({ dispatched: false, reason: 'all tasks checked' }),
      }) as unknown as InstanceType<typeof ContinuationDispatcher>,
  );

  vi.mocked(readFile).mockResolvedValue(mockPlanContent as unknown as never);

  return {
    mockHeartbeat,
    mockServerHandle,
    mockSessionManager,
    mockPostgREST,
    mockTask,
    mockTokenTracker,
  };
}

describe('orchestrate.mts', () => {
  let exitSpy: { mock: { calls: Array<unknown[]> } };

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`EXIT_${code}`);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    process.env.GITHUB_TOKEN = 'test-token';

    // Re-apply default mock return values — this is critical because
    // vi.restoreAllMocks() in afterEach clears all mock implementations,
    // and vi.resetModules() re-imports modules without re-running vi.mock() factories
    applyDefaultMockValues();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_TOKEN;
  });

  it('happy path: all mocks succeed → execution completed, process.exit(0)', async () => {
    setupHappyPath();
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('missing task context: parseTaskContext returns null → process.exit(1)', async () => {
    setupHappyPath();
    vi.mocked(parseTaskContext).mockReturnValue(null);
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('OpenCode server fails: startOpencodeServer returns null → process.exit(1), heartbeat stopped', async () => {
    const { mockHeartbeat } = setupHappyPath();
    vi.mocked(startOpencodeServer).mockResolvedValue(null);
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
  });

  it('session creation fails: sessionManager.createSession returns null → process.exit(1), server killed', async () => {
    const { mockServerHandle, mockSessionManager } = setupHappyPath();
    vi.mocked(createSessionManager).mockReturnValue({
      ...mockSessionManager,
      createSession: vi.fn().mockResolvedValue(null),
    });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('fix loop fails: runWithFixLoop returns { success: false } → process.exit(1), heartbeat stopped', async () => {
    const { mockHeartbeat } = setupHappyPath();
    vi.mocked(runWithFixLoop).mockResolvedValue({ success: false, totalIterations: 3 });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
  });

  it('missing execution ID: fs.readFileSync throws → executionId is null, execution continues', async () => {
    setupHappyPath();
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('heartbeat.updateStage called: executing then validating stages', async () => {
    const { mockHeartbeat } = setupHappyPath();
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockHeartbeat.updateStage).toHaveBeenCalledWith('executing');
    expect(mockHeartbeat.updateStage).toHaveBeenCalledWith('validating');
  });

  it('patchExecution called: execution record updated with stage changes', async () => {
    const { mockPostgREST } = setupHappyPath();
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(0);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const stageUpdates = patchCalls.filter((call) => call[2]?.current_stage);
    expect(stageUpdates.length).toBeGreaterThan(0);
    const stages = stageUpdates.map((call) => call[2]?.current_stage);
    expect(stages).toContain('starting');
    expect(stages).toContain('executing');
    expect(stages).toContain('validating');
    expect(stages).toContain('done');
  });

  it('cleanup on success: heartbeat.stop() and serverHandle.kill() both called', async () => {
    const { mockHeartbeat, mockServerHandle } = setupHappyPath();
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('unhandled error in main: caught and logged, process.exit(1)', async () => {
    setupHappyPath();
    vi.mocked(runPlanningPhase).mockRejectedValue(new Error('Unexpected error'));
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('happy path includes Steps 12-16: completing stage set, branch ensured, push done, PR created, completion called', async () => {
    const { mockHeartbeat } = setupHappyPath();
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockHeartbeat.updateStage).toHaveBeenCalledWith('completing');
    expect(fetchProjectConfig).toHaveBeenCalledWith('proj-1', expect.anything());
    expect(buildBranchName).toHaveBeenCalled();
    expect(ensureBranch).toHaveBeenCalledWith('ai/PROJ-1-test-task', '/workspace');
    expect(commitAndPush).toHaveBeenCalled();
    expect(createOrUpdatePR).toHaveBeenCalled();
    expect(runCompletionFlow).toHaveBeenCalledWith(
      { taskId: 'task-1', executionId: expect.any(String), prUrl: expect.anything() },
      expect.anything(),
    );
  });

  it('project config fetch returns null: falls back to defaults, branch still created, completion still runs', async () => {
    setupHappyPath();
    vi.mocked(fetchProjectConfig).mockResolvedValue(null);
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(buildBranchName).toHaveBeenCalled();
    expect(ensureBranch).toHaveBeenCalled();
    expect(runCompletionFlow).toHaveBeenCalled();
  });

  it('branch creation failure → exit(1), heartbeat stopped, server killed', async () => {
    const { mockHeartbeat, mockServerHandle } = setupHappyPath();
    vi.mocked(ensureBranch).mockResolvedValue({
      success: false,
      existed: false,
      error: 'checkout failed',
    });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('push failure (error set) → exit(1), heartbeat stopped, server killed', async () => {
    const { mockHeartbeat, mockServerHandle } = setupHappyPath();
    vi.mocked(commitAndPush).mockResolvedValue({ pushed: false, error: 'remote rejected' });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('empty diff (pushed: false, no error) → still creates PR, sends completion with prUrl', async () => {
    setupHappyPath();
    vi.mocked(commitAndPush).mockResolvedValue({ pushed: false, reason: 'no_changes' });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(createOrUpdatePR).toHaveBeenCalled();
  });

  it('PR creation throws → logs warning, still sends completion with null prUrl, exit(0)', async () => {
    setupHappyPath();
    vi.mocked(createOrUpdatePR).mockRejectedValue(new Error('GitHub API error'));
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockLogger.warn).toHaveBeenCalled();
    expect(runCompletionFlow).toHaveBeenCalledWith(
      expect.objectContaining({ prUrl: null }),
      expect.anything(),
    );
  });

  it('Supabase completion write fails → exit(1), heartbeat stopped, server killed', async () => {
    const { mockHeartbeat, mockServerHandle } = setupHappyPath();
    vi.mocked(runCompletionFlow).mockResolvedValue({ supabaseWritten: false, inngestSent: false });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('Inngest send fails after Supabase written → warns, exit(0) (work done, watchdog recovers)', async () => {
    setupHappyPath();
    vi.mocked(runCompletionFlow).mockResolvedValue({ supabaseWritten: true, inngestSent: false });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('watchdog will recover'));
  });

  it('GITHUB_TOKEN absent → PR creation skipped entirely, completion still called', async () => {
    setupHappyPath();
    delete process.env.GITHUB_TOKEN;
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(createOrUpdatePR).not.toHaveBeenCalled();
    expect(runCompletionFlow).toHaveBeenCalled();
  });

  it('patchExecution includes completing stage in success path', async () => {
    const { mockPostgREST } = setupHappyPath();
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const stages = patchCalls
      .filter((call) => call[2]?.current_stage)
      .map((call) => call[2]?.current_stage);
    expect(stages).toContain('completing');
    expect(stages).toContain('done');
  });

  it('happy path: token counts are written to executions before completion flow (when non-zero)', async () => {
    const { mockPostgREST, mockTokenTracker } = setupHappyPath();
    vi.mocked(mockTokenTracker.getAccumulated).mockReturnValue({
      promptTokens: 100,
      completionTokens: 50,
      estimatedCostUsd: 0.01,
      primaryModelId: 'minimax/minimax-m2.7',
    });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const tokenPatch = patchCalls.find((call) => 'estimated_cost_usd' in (call[2] ?? {}));
    expect(tokenPatch).toBeDefined();
    expect(tokenPatch![2]).toMatchObject({
      prompt_tokens: 100,
      completion_tokens: 50,
      estimated_cost_usd: 0.01,
    });
  });

  it('zero token counts: PATCH is NOT called when both promptTokens and completionTokens are 0', async () => {
    const { mockPostgREST, mockTokenTracker } = setupHappyPath();
    vi.mocked(mockTokenTracker.getAccumulated).mockReturnValue({
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      primaryModelId: '',
    });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const tokenPatch = patchCalls.find((call) => 'estimated_cost_usd' in (call[2] ?? {}));
    expect(tokenPatch).toBeUndefined();
  });

  it('fix loop failure path: token counts are written to executions before exit (when non-zero)', async () => {
    const { mockPostgREST, mockTokenTracker } = setupHappyPath();
    vi.mocked(runWithFixLoop).mockResolvedValue({ success: false, totalIterations: 3 });
    vi.mocked(mockTokenTracker.getAccumulated).mockReturnValue({
      promptTokens: 50,
      completionTokens: 25,
      estimatedCostUsd: 0.005,
      primaryModelId: 'minimax/minimax-m2.7',
    });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(1);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const tokenPatch = patchCalls.find((call) => 'estimated_cost_usd' in (call[2] ?? {}));
    expect(tokenPatch).toBeDefined();
    expect(tokenPatch![2]).toMatchObject({
      prompt_tokens: 50,
      completion_tokens: 25,
      estimated_cost_usd: 0.005,
    });
  });

  it('fix loop failure with zero tokens: PATCH is NOT called when both token counts are 0', async () => {
    const { mockPostgREST, mockTokenTracker } = setupHappyPath();
    vi.mocked(runWithFixLoop).mockResolvedValue({ success: false, totalIterations: 3 });
    vi.mocked(mockTokenTracker.getAccumulated).mockReturnValue({
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      primaryModelId: '',
    });
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(1);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const tokenPatch = patchCalls.find((call) => 'estimated_cost_usd' in (call[2] ?? {}));
    expect(tokenPatch).toBeUndefined();
  });

  it('agent_version_id included in starting PATCH', async () => {
    const { mockPostgREST } = setupHappyPath();
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const startingPatch = patchCalls.find((call) => call[2]?.current_stage === 'starting');
    expect(startingPatch).toBeDefined();
    expect(startingPatch![2]).toHaveProperty('agent_version_id');
    expect(startingPatch![2].agent_version_id).toBe('mock-agent-version-id');
  });

  it('existing agent version found → POST not called, reuses existing ID', async () => {
    const { mockPostgREST } = setupHappyPath();
    vi.mocked(mockPostgREST.get).mockResolvedValue([{ id: 'existing-version-id' }]);
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const postCalls = vi.mocked(mockPostgREST.post).mock.calls;
    const versionPost = postCalls.find((call) => call[0] === 'agent_versions');
    expect(versionPost).toBeUndefined();
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const startingPatch = patchCalls.find((call) => call[2]?.current_stage === 'starting');
    expect(startingPatch![2].agent_version_id).toBe('existing-version-id');
  });

  it('uses ORCHESTRATE_TIMEOUT_MINS env var for code gen timeout in finalize', async () => {
    const { mockSessionManager } = setupHappyPath();
    process.env.ORCHESTRATE_TIMEOUT_MINS = '120';
    await main().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const monitorCalls = vi.mocked(mockSessionManager.monitorSession).mock.calls;
    const longTimeoutCall = monitorCalls.find((call) => call[1]?.timeoutMs === 120 * 60 * 1000);
    expect(longTimeoutCall).toBeDefined();
    delete process.env.ORCHESTRATE_TIMEOUT_MINS;
  });

  describe('Wave 3 behaviors', () => {
    it('restart idempotency: loadPlanOnRestart returns plan → runPlanningPhase NOT called', async () => {
      setupHappyPath();
      vi.mocked(PlanSync).mockImplementation(
        () =>
          ({
            loadPlanOnRestart: vi
              .fn()
              .mockResolvedValue({ planContent: mockPlanContent, source: 'disk' }),
            savePlanAfterPhase1: vi.fn().mockResolvedValue(undefined),
            updateWaveState: vi.fn().mockResolvedValue(undefined),
          }) as unknown as InstanceType<typeof PlanSync>,
      );

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(runPlanningPhase).not.toHaveBeenCalled();
    });

    it('heartbeat continues during Phase 1 — still active, stages updated', async () => {
      const { mockHeartbeat } = setupHappyPath();
      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(startHeartbeat).toHaveBeenCalledOnce();
      expect(mockHeartbeat.updateStage).toHaveBeenCalledWith('planning');
    });

    it('phase 2 linear: parsePlan called, waves execute in order', async () => {
      setupHappyPath();
      const parsePlanSpy = vi.mocked(parsePlan);

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(parsePlanSpy).toHaveBeenCalled();
    });

    it('phase 2 failure: wave fails → process.exit(1) + fallback PR called', async () => {
      setupHappyPath();
      vi.mocked(CompletionDetector).mockImplementation(
        () =>
          ({
            waitForCompletion: vi
              .fn()
              .mockResolvedValue({ outcome: 'timeout', reason: 'timed out', idleCount: 0 }),
          }) as unknown as InstanceType<typeof CompletionDetector>,
      );
      vi.mocked(parsePlan).mockReturnValue({
        waves: [
          {
            number: 1,
            tasks: [{ number: 1, title: 'Task one', completed: false }],
          },
        ],
        totalWaves: 1,
        totalTasks: 1,
        completedTasks: 0,
      });

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(1);
      expect(createFallbackPr).toHaveBeenCalled();
    });

    it('fallback PR NOT called on success path', async () => {
      setupHappyPath();
      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(createFallbackPr).not.toHaveBeenCalled();
    });

    it('continuation loop: idle outcome → dispatchContinuation called, then completed', async () => {
      setupHappyPath();
      vi.mocked(CompletionDetector).mockImplementation(
        () =>
          ({
            waitForCompletion: vi
              .fn()
              .mockResolvedValueOnce({ outcome: 'idle', reason: '3 idle polls', idleCount: 3 })
              .mockResolvedValueOnce({ outcome: 'completed', reason: 'SSE', idleCount: 0 }),
          }) as unknown as InstanceType<typeof CompletionDetector>,
      );
      const mockDispatcher = {
        dispatchContinuation: vi
          .fn()
          .mockResolvedValue({ dispatched: true, reason: 'sent 2 tasks' }),
      };
      vi.mocked(ContinuationDispatcher).mockImplementation(
        () => mockDispatcher as unknown as InstanceType<typeof ContinuationDispatcher>,
      );

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(mockDispatcher.dispatchContinuation).toHaveBeenCalledOnce();
    });

    it('continuation reset: continuationCount resets to 0 at each wave boundary', async () => {
      setupHappyPath();
      vi.mocked(parsePlan).mockReturnValue({
        waves: [
          {
            number: 1,
            tasks: [{ number: 1, title: 'Wave 1 task', completed: true }],
          },
          {
            number: 2,
            tasks: [{ number: 1, title: 'Wave 2 task', completed: true }],
          },
        ],
        totalWaves: 2,
        totalTasks: 2,
        completedTasks: 2,
      });

      const callCount = { count: 0 };
      vi.mocked(CompletionDetector).mockImplementation(
        () =>
          ({
            waitForCompletion: vi.fn().mockImplementation(() => {
              callCount.count++;
              return Promise.resolve({ outcome: 'completed', reason: 'SSE', idleCount: 0 });
            }),
          }) as unknown as InstanceType<typeof CompletionDetector>,
      );

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(callCount.count).toBe(2);
    });

    it('install re-run: package.json hash changes after wave → runInstallCommand called again', async () => {
      setupHappyPath();

      const { execFile } = await import('node:child_process');
      let callCount = 0;
      vi.mocked(execFile).mockImplementation((_cmd, _args, _opts, callback) => {
        callCount++;
        const hash = callCount <= 1 ? 'hash-before\n' : 'hash-after\n';
        if (typeof callback === 'function') {
          callback(null, { stdout: hash, stderr: '' } as unknown as never, '');
        }
        return {} as unknown as import('child_process').ChildProcess;
      });

      const { runInstallCommand: mockInstall } =
        await import('../../src/workers/lib/install-runner.js');

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(vi.mocked(mockInstall)).toHaveBeenCalledTimes(2);
    });

    it('no install re-run: package.json hash unchanged → runInstallCommand called once (pre-flight only)', async () => {
      setupHappyPath();
      const { runInstallCommand: mockInstall } =
        await import('../../src/workers/lib/install-runner.js');

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(vi.mocked(mockInstall)).toHaveBeenCalledOnce();
    });

    it('between-wave push: pushBetweenWaves called after each successful wave', async () => {
      setupHappyPath();
      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(pushBetweenWaves).toHaveBeenCalledWith(
        expect.objectContaining({
          branchName: 'ai/PROJ-1-test-task',
          waveNumber: 1,
          repoRoot: '/workspace',
        }),
      );
    });

    it('cost breaker check: shouldStop NOT called before wave 1', async () => {
      setupHappyPath();
      const mockBreaker = {
        shouldStop: vi.fn().mockReturnValue({
          stop: false,
          reason: 'within cap',
          totals: { tokensIn: 0, tokensOut: 0 },
        }),
      };
      vi.mocked(CostBreaker).mockImplementation(
        () => mockBreaker as unknown as InstanceType<typeof CostBreaker>,
      );

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(mockBreaker.shouldStop).not.toHaveBeenCalledWith(1);
    });

    it('cost breaker check: shouldStop called before wave 2 and beyond', async () => {
      setupHappyPath();
      vi.mocked(parsePlan).mockReturnValue({
        waves: [
          {
            number: 1,
            tasks: [{ number: 1, title: 'Wave 1', completed: true }],
          },
          {
            number: 2,
            tasks: [{ number: 1, title: 'Wave 2', completed: true }],
          },
        ],
        totalWaves: 2,
        totalTasks: 2,
        completedTasks: 2,
      });

      const mockBreaker = {
        shouldStop: vi.fn().mockReturnValue({
          stop: false,
          reason: 'within cap',
          totals: { tokensIn: 0, tokensOut: 0 },
        }),
      };
      vi.mocked(CostBreaker).mockImplementation(
        () => mockBreaker as unknown as InstanceType<typeof CostBreaker>,
      );

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(mockBreaker.shouldStop).toHaveBeenCalledWith(2);
      expect(mockBreaker.shouldStop).not.toHaveBeenCalledWith(1);
    });

    it('cost breaker stops: stop:true → escalate called, loop breaks, exit(1)', async () => {
      setupHappyPath();
      vi.mocked(parsePlan).mockReturnValue({
        waves: [
          { number: 1, tasks: [{ number: 1, title: 'Wave 1', completed: true }] },
          { number: 2, tasks: [{ number: 1, title: 'Wave 2', completed: false }] },
        ],
        totalWaves: 2,
        totalTasks: 2,
        completedTasks: 1,
      });

      const mockBreaker = {
        shouldStop: vi.fn().mockReturnValue({
          stop: true,
          reason: 'cap exceeded',
          totals: { tokensIn: 5000000, tokensOut: 100 },
        }),
      };
      vi.mocked(CostBreaker).mockImplementation(
        () => mockBreaker as unknown as InstanceType<typeof CostBreaker>,
      );

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(escalate).toHaveBeenCalled();
    });

    it('rethrow after fallback PR: original error propagates to exit(1)', async () => {
      setupHappyPath();
      vi.mocked(CompletionDetector).mockImplementation(
        () =>
          ({
            waitForCompletion: vi
              .fn()
              .mockResolvedValue({ outcome: 'timeout', reason: 'timed out', idleCount: 0 }),
          }) as unknown as InstanceType<typeof CompletionDetector>,
      );
      vi.mocked(parsePlan).mockReturnValue({
        waves: [{ number: 1, tasks: [{ number: 1, title: 'Task', completed: false }] }],
        totalWaves: 1,
        totalTasks: 1,
        completedTasks: 0,
      });

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(createFallbackPr).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('wave state update: planSync.updateWaveState called after each wave', async () => {
      setupHappyPath();
      const mockPlanSync = {
        loadPlanOnRestart: vi.fn().mockResolvedValue(null),
        savePlanAfterPhase1: vi.fn().mockResolvedValue(undefined),
        updateWaveState: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(PlanSync).mockImplementation(
        () => mockPlanSync as unknown as InstanceType<typeof PlanSync>,
      );

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(mockPlanSync.updateWaveState).toHaveBeenCalledWith(
        expect.objectContaining({
          waveNumber: 1,
          waveState: expect.objectContaining({ waves: expect.any(Array) }),
        }),
      );
    });

    it('planSync.savePlanAfterPhase1 called after planning', async () => {
      setupHappyPath();
      const mockPlanSync = {
        loadPlanOnRestart: vi.fn().mockResolvedValue(null),
        savePlanAfterPhase1: vi.fn().mockResolvedValue(undefined),
        updateWaveState: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(PlanSync).mockImplementation(
        () => mockPlanSync as unknown as InstanceType<typeof PlanSync>,
      );

      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(mockPlanSync.savePlanAfterPhase1).toHaveBeenCalledWith(
        expect.objectContaining({ taskId: 'task-1' }),
      );
    });

    it('heartbeat stage set to planning during phase 1', async () => {
      const { mockHeartbeat } = setupHappyPath();
      await main().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(exitSpy).toHaveBeenCalledWith(0);
      expect(mockHeartbeat.updateStage).toHaveBeenCalledWith('planning');
    });
  });
});
