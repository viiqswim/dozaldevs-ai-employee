import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostgRESTClient } from '../../src/workers/lib/postgrest-client.js';
import type { HeartbeatHandle } from '../../src/workers/lib/heartbeat.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

vi.mock('../../src/workers/lib/postgrest-client.js', () => ({
  createPostgRESTClient: vi.fn(),
}));

vi.mock('../../src/workers/lib/task-context.js', () => ({
  parseTaskContext: vi.fn(),
  buildPrompt: vi.fn(),
  resolveToolingConfig: vi.fn(),
}));

vi.mock('../../src/workers/lib/opencode-server.js', () => ({
  startOpencodeServer: vi.fn(),
}));

vi.mock('../../src/workers/lib/session-manager.js', () => ({
  createSessionManager: vi.fn(),
}));

vi.mock('../../src/workers/lib/fix-loop.js', () => ({
  runWithFixLoop: vi.fn(),
}));

vi.mock('../../src/workers/lib/heartbeat.js', () => ({
  startHeartbeat: vi.fn(),
}));

vi.mock('../../src/workers/lib/branch-manager.js', () => ({
  buildBranchName: vi.fn().mockReturnValue('ai/PROJ-1-test-task'),
  ensureBranch: vi.fn().mockResolvedValue({ success: true, existed: false }),
  commitAndPush: vi.fn().mockResolvedValue({ pushed: true }),
}));

vi.mock('../../src/workers/lib/pr-manager.js', () => ({
  createOrUpdatePR: vi.fn().mockResolvedValue({
    pr: {
      html_url: 'https://github.com/org/repo/pull/1',
      number: 1,
      title: '[AI] TEST-001',
      head: { ref: 'ai/PROJ-1-test-task' },
      base: { ref: 'main' },
      state: 'open',
    },
    wasExisting: false,
  }),
}));

vi.mock('../../src/workers/lib/completion.js', () => ({
  runCompletionFlow: vi.fn().mockResolvedValue({ supabaseWritten: true, inngestSent: true }),
}));

vi.mock('../../src/workers/lib/project-config.js', () => ({
  fetchProjectConfig: vi.fn().mockResolvedValue({
    id: 'proj-1',
    name: 'test',
    repo_url: 'https://github.com/org/repo',
    default_branch: 'main',
    tooling_config: null,
  }),
  parseRepoOwnerAndName: vi.fn().mockReturnValue({ owner: 'org', repo: 'repo' }),
}));

vi.mock('../../src/workers/lib/token-tracker.js', () => ({
  TokenTracker: vi.fn().mockImplementation(() => ({
    addUsage: vi.fn(),
    getAccumulated: vi.fn().mockReturnValue({
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      primaryModelId: '',
    }),
    reset: vi.fn(),
  })),
}));

vi.mock('../../src/lib/agent-version.js', () => ({
  computeVersionHash: vi.fn().mockReturnValue({
    promptHash: 'mock-prompt-hash',
    modelId: 'anthropic/claude-sonnet-4-6',
    toolConfigHash: 'mock-tool-config-hash',
  }),
  ensureAgentVersion: vi.fn(),
}));

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
import { startHeartbeat } from '../../src/workers/lib/heartbeat.js';
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

// Helper to create mock objects
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
    modelId: 'anthropic/claude-sonnet-4-6',
    toolConfigHash: 'mock-tool-config-hash',
  });

  vi.mocked(TokenTracker).mockImplementation(
    () => mockTokenTracker as unknown as InstanceType<typeof TokenTracker>,
  );

  vi.mocked(fs.readFileSync).mockReturnValue('exec-id-123');
  vi.mocked(createPostgRESTClient).mockReturnValue(mockPostgREST);
  vi.mocked(parseTaskContext).mockReturnValue(mockTask);
  vi.mocked(buildPrompt).mockReturnValue('Build this feature...');
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
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    delete process.env.GITHUB_TOKEN;
  });

  it('happy path: all mocks succeed → execution completed, process.exit(0)', async () => {
    setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('missing task context: parseTaskContext returns null → process.exit(1)', async () => {
    setupHappyPath();
    vi.mocked(parseTaskContext).mockReturnValue(null);
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('OpenCode server fails: startOpencodeServer returns null → process.exit(1), heartbeat stopped', async () => {
    const { mockHeartbeat } = setupHappyPath();
    vi.mocked(startOpencodeServer).mockResolvedValue(null);
    await import('../../src/workers/orchestrate.mjs');
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
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('session monitor times out: monitorSession returns { completed: false } → process.exit(1), server killed', async () => {
    const { mockServerHandle, mockSessionManager } = setupHappyPath();
    vi.mocked(createSessionManager).mockReturnValue({
      ...mockSessionManager,
      monitorSession: vi.fn().mockResolvedValue({ completed: false, reason: 'timeout' }),
    });
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('fix loop fails: runWithFixLoop returns { success: false } → process.exit(1), heartbeat stopped', async () => {
    const { mockHeartbeat } = setupHappyPath();
    vi.mocked(runWithFixLoop).mockResolvedValue({ success: false, totalIterations: 3 });
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
  });

  it('missing execution ID: fs.readFileSync throws → executionId is null, execution continues', async () => {
    setupHappyPath();
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('ENOENT');
    });
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('heartbeat.updateStage called: executing then validating stages', async () => {
    const { mockHeartbeat } = setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockHeartbeat.updateStage).toHaveBeenCalledWith('executing');
    expect(mockHeartbeat.updateStage).toHaveBeenCalledWith('validating');
  });

  it('patchExecution called: execution record updated with stage changes', async () => {
    const { mockPostgREST } = setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
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
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('unhandled error in main: caught and logged, process.exit(1)', async () => {
    setupHappyPath();
    vi.mocked(parseTaskContext).mockImplementation(() => {
      throw new Error('Unexpected error');
    });
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('happy path includes Steps 12-16: completing stage set, branch ensured, push done, PR created, completion called', async () => {
    const { mockHeartbeat } = setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(mockHeartbeat.updateStage).toHaveBeenCalledWith('completing');
    expect(fetchProjectConfig).toHaveBeenCalledWith('proj-1', expect.anything());
    expect(buildBranchName).toHaveBeenCalled();
    expect(ensureBranch).toHaveBeenCalledWith('ai/PROJ-1-test-task', '/workspace');
    expect(commitAndPush).toHaveBeenCalledWith(
      'ai/PROJ-1-test-task',
      expect.any(String),
      '/workspace',
    );
    expect(createOrUpdatePR).toHaveBeenCalled();
    expect(runCompletionFlow).toHaveBeenCalledWith(
      { taskId: 'task-1', executionId: expect.any(String), prUrl: expect.anything() },
      expect.anything(),
    );
  });

  it('project config fetch returns null: falls back to defaults, branch still created, completion still runs', async () => {
    setupHappyPath();
    vi.mocked(fetchProjectConfig).mockResolvedValue(null);
    await import('../../src/workers/orchestrate.mjs');
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
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('push failure (error set) → exit(1), heartbeat stopped, server killed', async () => {
    const { mockHeartbeat, mockServerHandle } = setupHappyPath();
    vi.mocked(commitAndPush).mockResolvedValue({ pushed: false, error: 'remote rejected' });
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('empty diff (pushed: false, no error) → skips PR creation, still sends completion with null prUrl', async () => {
    setupHappyPath();
    vi.mocked(commitAndPush).mockResolvedValue({ pushed: false, reason: 'no_changes' });
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(createOrUpdatePR).not.toHaveBeenCalled();
    expect(runCompletionFlow).toHaveBeenCalledWith(
      expect.objectContaining({ prUrl: null }),
      expect.anything(),
    );
  });

  it('PR creation throws → logs warning, still sends completion with null prUrl, exit(0)', async () => {
    setupHappyPath();
    vi.mocked(createOrUpdatePR).mockRejectedValue(new Error('GitHub API error'));
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(console.warn).toHaveBeenCalled();
    expect(runCompletionFlow).toHaveBeenCalledWith(
      expect.objectContaining({ prUrl: null }),
      expect.anything(),
    );
  });

  it('Supabase completion write fails → exit(1), heartbeat stopped, server killed', async () => {
    const { mockHeartbeat, mockServerHandle } = setupHappyPath();
    vi.mocked(runCompletionFlow).mockResolvedValue({ supabaseWritten: false, inngestSent: false });
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(mockHeartbeat.stop).toHaveBeenCalled();
    expect(mockServerHandle.kill).toHaveBeenCalled();
  });

  it('Inngest send fails after Supabase written → warns, exit(0) (work done, watchdog recovers)', async () => {
    setupHappyPath();
    vi.mocked(runCompletionFlow).mockResolvedValue({ supabaseWritten: true, inngestSent: false });
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('watchdog will recover'));
  });

  it('GITHUB_TOKEN absent → PR creation skipped entirely, completion still called', async () => {
    setupHappyPath();
    delete process.env.GITHUB_TOKEN;
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(createOrUpdatePR).not.toHaveBeenCalled();
    expect(runCompletionFlow).toHaveBeenCalled();
  });

  it('patchExecution includes completing stage in success path', async () => {
    const { mockPostgREST } = setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const stages = patchCalls
      .filter((call) => call[2]?.current_stage)
      .map((call) => call[2]?.current_stage);
    expect(stages).toContain('completing');
    expect(stages).toContain('done');
  });

  it('happy path: token counts are written to executions before completion flow', async () => {
    const { mockPostgREST } = setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const tokenPatch = patchCalls.find((call) => 'estimated_cost_usd' in (call[2] ?? {}));
    expect(tokenPatch).toBeDefined();
    expect(tokenPatch![2]).toMatchObject({
      prompt_tokens: expect.any(Number),
      completion_tokens: expect.any(Number),
      estimated_cost_usd: expect.any(Number),
    });
  });

  it('fix loop failure path: token counts are written to executions before exit', async () => {
    const { mockPostgREST } = setupHappyPath();
    vi.mocked(runWithFixLoop).mockResolvedValue({ success: false, totalIterations: 3 });
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(1);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const tokenPatch = patchCalls.find((call) => 'estimated_cost_usd' in (call[2] ?? {}));
    expect(tokenPatch).toBeDefined();
    expect(tokenPatch![2]).toMatchObject({
      prompt_tokens: expect.any(Number),
      completion_tokens: expect.any(Number),
      estimated_cost_usd: expect.any(Number),
    });
  });

  it('TokenTracker is instantiated once per orchestration run', async () => {
    setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(TokenTracker).toHaveBeenCalledTimes(1);
  });

  it('fetchProjectConfig called early (Step 4) before fix loop runs', async () => {
    setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(fetchProjectConfig).toHaveBeenCalledWith('proj-1', expect.anything());
    // Verify it was called before runWithFixLoop
    const fetchCall = vi.mocked(fetchProjectConfig).mock.invocationCallOrder[0];
    const fixLoopCall = vi.mocked(runWithFixLoop).mock.invocationCallOrder[0];
    expect(fetchCall).toBeLessThan(fixLoopCall);
  });

  it('real tooling_config from project config passed to fix loop when available', async () => {
    setupHappyPath();
    const customToolingConfig = {
      typescript: 'pnpm tsc --noEmit',
      lint: 'pnpm eslint .',
      unit: 'pnpm test',
      integration: 'pnpm test:integration',
      e2e: 'pnpm test:e2e',
    };
    vi.mocked(fetchProjectConfig).mockResolvedValue({
      id: 'proj-1',
      name: 'test',
      repo_url: 'https://github.com/org/repo',
      default_branch: 'main',
      tooling_config: customToolingConfig,
    });
    vi.mocked(resolveToolingConfig).mockReturnValue(customToolingConfig);
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(runWithFixLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        toolingConfig: customToolingConfig,
      }),
    );
  });

  it('fallback to DEFAULT_TOOLING_CONFIG when fetchProjectConfig returns null', async () => {
    setupHappyPath();
    vi.mocked(fetchProjectConfig).mockResolvedValue(null);
    vi.mocked(resolveToolingConfig).mockReturnValue({});
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(fetchProjectConfig).toHaveBeenCalled();
    expect(runWithFixLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        toolingConfig: {},
      }),
    );
  });

  it('agent_version_id included in starting PATCH', async () => {
    const { mockPostgREST } = setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const startingPatch = patchCalls.find((call) => call[2]?.current_stage === 'starting');
    expect(startingPatch).toBeDefined();
    expect(startingPatch![2]).toHaveProperty('agent_version_id');
    expect(startingPatch![2].agent_version_id).toBe('mock-agent-version-id');
  });

  it('agent_versions table queried for version lookup at startup', async () => {
    const { mockPostgREST } = setupHappyPath();
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const getCalls = vi.mocked(mockPostgREST.get).mock.calls;
    const versionLookup = getCalls.find((call) => call[0] === 'agent_versions');
    expect(versionLookup).toBeDefined();
    expect(computeVersionHash).toHaveBeenCalledWith({
      promptTemplate: 'opencode-execution-v1',
      modelId: expect.any(String),
      toolConfig: { version: '1.0', opencode: true },
    });
  });

  it('existing agent version found → POST not called, reuses existing ID', async () => {
    const { mockPostgREST } = setupHappyPath();
    vi.mocked(mockPostgREST.get).mockResolvedValue([{ id: 'existing-version-id' }]);
    await import('../../src/workers/orchestrate.mjs');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(exitSpy).toHaveBeenCalledWith(0);
    const postCalls = vi.mocked(mockPostgREST.post).mock.calls;
    const versionPost = postCalls.find((call) => call[0] === 'agent_versions');
    expect(versionPost).toBeUndefined();
    const patchCalls = vi.mocked(mockPostgREST.patch).mock.calls;
    const startingPatch = patchCalls.find((call) => call[2]?.current_stage === 'starting');
    expect(startingPatch![2].agent_version_id).toBe('existing-version-id');
  });
});
