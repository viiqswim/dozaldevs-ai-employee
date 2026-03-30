import { describe, it, expect, vi, afterEach } from 'vitest';
import type { PostgRESTClient } from '../../../src/workers/lib/postgrest-client.js';
import type { SessionManager } from '../../../src/workers/lib/session-manager.js';
import type { HeartbeatHandle } from '../../../src/workers/lib/heartbeat.js';
import type { ToolingConfig } from '../../../src/workers/lib/task-context.js';
import type { ValidationStage } from '../../../src/workers/lib/validation-pipeline.js';

vi.mock('../../../src/workers/lib/validation-pipeline.js', () => ({
  runValidationPipeline: vi.fn(),
}));

vi.mock('../../../src/workers/lib/heartbeat.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/workers/lib/heartbeat.js')>();
  return {
    ...actual,
    escalate: vi.fn().mockResolvedValue(undefined),
  };
});

const { runWithFixLoop } = await import('../../../src/workers/lib/fix-loop.js');
const { runValidationPipeline } = await import('../../../src/workers/lib/validation-pipeline.js');
const { escalate } = await import('../../../src/workers/lib/heartbeat.js');

const mockRunPipeline = vi.mocked(runValidationPipeline);
const mockEscalate = vi.mocked(escalate);

function createMockSessionManager(): SessionManager {
  return {
    createSession: vi.fn().mockResolvedValue('sess-1'),
    injectTaskPrompt: vi.fn().mockResolvedValue(true),
    monitorSession: vi.fn().mockResolvedValue({ completed: true, reason: 'idle' }),
    abortSession: vi.fn().mockResolvedValue(undefined),
    sendFixPrompt: vi.fn().mockResolvedValue(true),
  };
}

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

const fullToolingConfig: ToolingConfig = {
  typescript: 'pnpm tsc --noEmit',
  lint: 'pnpm lint',
  unit: 'pnpm test -- --run',
};

interface OptionsOverrides {
  sessionManager?: SessionManager;
  postgrestClient?: PostgRESTClient;
  heartbeat?: HeartbeatHandle;
  executionId?: string | null;
}

function buildOptions(overrides: OptionsOverrides = {}) {
  return {
    sessionId: 'sess-1',
    sessionManager: overrides.sessionManager ?? createMockSessionManager(),
    executionId: overrides.executionId !== undefined ? overrides.executionId : 'exec-1',
    toolingConfig: fullToolingConfig,
    postgrestClient: overrides.postgrestClient ?? createMockPostgRESTClient(),
    heartbeat: overrides.heartbeat ?? createMockHeartbeat(),
    taskId: 'task-1',
  };
}

function failPipeline(stage: ValidationStage, errorOutput = 'error output') {
  mockRunPipeline.mockResolvedValueOnce({
    passed: false,
    failedStage: stage,
    errorOutput,
    stageResults: [],
  });
}

function passPipeline() {
  mockRunPipeline.mockResolvedValueOnce({ passed: true, stageResults: [] });
}

describe('runWithFixLoop', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('1: happy path — pipeline passes immediately → success:true totalIterations:0', async () => {
    passPipeline();

    const result = await runWithFixLoop(buildOptions());

    expect(result).toEqual({ success: true, totalIterations: 0 });
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  it('2: one fix cycle — pipeline fails once then passes → success:true totalIterations:1', async () => {
    failPipeline('typescript', 'TS error');
    passPipeline();

    const result = await runWithFixLoop(buildOptions());

    expect(result).toEqual({ success: true, totalIterations: 1 });
    expect(mockRunPipeline).toHaveBeenCalledTimes(2);
  });

  it('3: typescript fix — first call has no fromStage, second call re-enters at "typescript"', async () => {
    failPipeline('typescript', 'TS error');
    passPipeline();

    await runWithFixLoop(buildOptions());

    expect(mockRunPipeline).toHaveBeenCalledTimes(2);
    expect(mockRunPipeline.mock.calls[0][0].fromStage).toBeUndefined();
    expect(mockRunPipeline.mock.calls[1][0].fromStage).toBe('typescript');
  });

  it('4: lint fix — second pipeline call has fromStage:"lint" (skips typescript)', async () => {
    failPipeline('lint', 'Lint error');
    passPipeline();

    await runWithFixLoop(buildOptions());

    expect(mockRunPipeline).toHaveBeenCalledTimes(2);
    expect(mockRunPipeline.mock.calls[1][0].fromStage).toBe('lint');
  });

  it('5: per-stage limit — typescript fails 4 times → success:false reason:per_stage_limit', async () => {
    failPipeline('typescript');
    failPipeline('typescript');
    failPipeline('typescript');
    failPipeline('typescript');

    const result = await runWithFixLoop(buildOptions());

    expect(result.success).toBe(false);
    expect(result.reason).toBe('per_stage_limit');
    expect(result.failedStage).toBe('typescript');
    expect(result.totalIterations).toBe(4);
  });

  it('6: per-stage count — 3 failures allowed (3 fix cycles), 4th triggers escalation', async () => {
    const sessionManager = createMockSessionManager();
    failPipeline('typescript');
    failPipeline('typescript');
    failPipeline('typescript');
    failPipeline('typescript');

    const result = await runWithFixLoop(buildOptions({ sessionManager }));

    expect(vi.mocked(sessionManager.sendFixPrompt)).toHaveBeenCalledTimes(3);
    expect(result.reason).toBe('per_stage_limit');
    expect(mockEscalate).toHaveBeenCalledTimes(1);
  });

  it('7: global limit — 10 iterations across different stages → success:false reason:global_limit totalIterations:10', async () => {
    const stages: ValidationStage[] = [
      'typescript',
      'lint',
      'unit',
      'typescript',
      'lint',
      'unit',
      'typescript',
      'lint',
      'unit',
      'integration',
    ];
    for (const stage of stages) {
      failPipeline(stage);
    }

    const result = await runWithFixLoop(buildOptions());

    expect(result.success).toBe(false);
    expect(result.reason).toBe('global_limit');
    expect(result.totalIterations).toBe(10);
  });

  it('8: fix_iterations PATCHed on executions table after each fix attempt', async () => {
    const postgrestClient = createMockPostgRESTClient();
    failPipeline('typescript', '');
    passPipeline();

    await runWithFixLoop(buildOptions({ postgrestClient }));

    expect(postgrestClient.patch).toHaveBeenCalledWith(
      'executions',
      'id=eq.exec-1',
      expect.objectContaining({ fix_iterations: 1 }),
    );
  });

  it('8b: fix_iterations not PATCHed when executionId is null', async () => {
    const postgrestClient = createMockPostgRESTClient();
    failPipeline('typescript', '');
    passPipeline();

    await runWithFixLoop(buildOptions({ postgrestClient, executionId: null }));

    expect(postgrestClient.patch).not.toHaveBeenCalledWith(
      'executions',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('9: heartbeat.updateStage("fixing") called before sending fix prompt', async () => {
    const heartbeat = createMockHeartbeat();
    const sessionManager = createMockSessionManager();
    failPipeline('typescript', '');
    passPipeline();

    await runWithFixLoop(buildOptions({ heartbeat, sessionManager }));

    const updateStage = vi.mocked(heartbeat.updateStage);
    const sendFixPrompt = vi.mocked(sessionManager.sendFixPrompt);

    expect(updateStage).toHaveBeenCalledWith('fixing');
    const updateOrder = updateStage.mock.invocationCallOrder[0];
    const sendOrder = sendFixPrompt.mock.invocationCallOrder[0];
    expect(updateOrder).toBeLessThan(sendOrder);
  });

  it('10: session monitor timeout → success:false reason:timeout, escalate called with session_timeout_during_fix', async () => {
    const sessionManager = createMockSessionManager();
    vi.mocked(sessionManager.monitorSession).mockResolvedValueOnce({ completed: false });
    failPipeline('typescript', 'TS error');

    const result = await runWithFixLoop(buildOptions({ sessionManager }));

    expect(result.success).toBe(false);
    expect(result.reason).toBe('timeout');
    expect(result.failedStage).toBe('typescript');
    expect(mockEscalate).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'session_timeout_during_fix' }),
    );
  });

  it('11: escalate() called on per-stage limit with correct taskId, reason (mentions stage), failedStage', async () => {
    failPipeline('typescript', 'compile error');
    failPipeline('typescript', 'compile error');
    failPipeline('typescript', 'compile error');
    failPipeline('typescript', 'compile error');

    await runWithFixLoop(buildOptions());

    expect(mockEscalate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        reason: expect.stringContaining('typescript'),
        failedStage: 'typescript',
      }),
    );
  });

  it('12: escalate() called on global limit with correct taskId and reason mentioning global limit', async () => {
    const stages: ValidationStage[] = [
      'typescript',
      'lint',
      'unit',
      'typescript',
      'lint',
      'unit',
      'typescript',
      'lint',
      'unit',
      'integration',
    ];
    for (const stage of stages) {
      failPipeline(stage);
    }

    await runWithFixLoop(buildOptions());

    expect(mockEscalate).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-1',
        reason: expect.stringMatching(/global/i),
      }),
    );
  });
});
