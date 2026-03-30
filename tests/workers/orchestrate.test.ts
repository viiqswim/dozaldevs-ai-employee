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

// Helper to create mock objects
function createMockPostgRESTClient(): PostgRESTClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
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
    project_id: null,
  };
}

function setupHappyPath() {
  const mockHeartbeat = createMockHeartbeat();
  const mockServerHandle = createMockServerHandle();
  const mockSessionManager = createMockSessionManager();
  const mockPostgREST = createMockPostgRESTClient();
  const mockTask = createMockTask();

  vi.mocked(fs.readFileSync).mockReturnValue('exec-id-123');
  vi.mocked(createPostgRESTClient).mockReturnValue(mockPostgREST);
  vi.mocked(parseTaskContext).mockReturnValue(mockTask);
  vi.mocked(buildPrompt).mockReturnValue('Build this feature...');
  vi.mocked(resolveToolingConfig).mockReturnValue({});
  vi.mocked(startOpencodeServer).mockResolvedValue(mockServerHandle);
  vi.mocked(createSessionManager).mockReturnValue(mockSessionManager);
  vi.mocked(startHeartbeat).mockReturnValue(mockHeartbeat);
  vi.mocked(runWithFixLoop).mockResolvedValue({ success: true, totalIterations: 0 });

  return { mockHeartbeat, mockServerHandle, mockSessionManager, mockPostgREST, mockTask };
}

describe('orchestrate.mts', () => {
  let exitSpy: { mock: { calls: Array<unknown[]> } };

  beforeEach(() => {
    vi.clearAllMocks();
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
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
});
