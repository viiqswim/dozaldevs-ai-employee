import { describe, it, expect, vi, afterEach } from 'vitest';
import type { SessionManager } from '../../../src/workers/lib/session-manager.js';
import type { LongRunningConfig } from '../../../src/workers/config/long-running.js';
import type { ParsedPlan, ParsedWave } from '../../../src/workers/lib/plan-parser.js';
import { CostTrackerV2 } from '../../../src/workers/lib/cost-tracker-v2.js';
import { createLogger } from '../../../src/lib/logger.js';
import {
  WaveExecutor,
  runAllWaves,
  type WaveExecutorOptions,
  type PlanParserInterface,
} from '../../../src/workers/lib/wave-executor.js';

const logger = createLogger('wave-executor-test');

function makeSessionManager(overrides: Partial<SessionManager> = {}): SessionManager {
  return {
    createSession: vi.fn().mockResolvedValue('session-abc'),
    injectTaskPrompt: vi.fn().mockResolvedValue(true),
    monitorSession: vi.fn().mockResolvedValue({ completed: true, reason: 'idle' }),
    abortSession: vi.fn().mockResolvedValue(undefined),
    sendFixPrompt: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function makeParsedWave(number: number, allCompleted = true): ParsedWave {
  return {
    number,
    tasks: [
      { number: 1, title: `Task A in wave ${number}`, completed: allCompleted },
      { number: 2, title: `Task B in wave ${number}`, completed: allCompleted },
    ],
  };
}

function makeParsedPlan(waveCount: number, allCompleted = true): ParsedPlan {
  const waves = Array.from({ length: waveCount }, (_, i) => makeParsedWave(i + 1, allCompleted));
  return {
    waves,
    totalWaves: waveCount,
    totalTasks: waveCount * 2,
    completedTasks: allCompleted ? waveCount * 2 : 0,
  };
}

function makePlanParser(plan: ParsedPlan): PlanParserInterface {
  return {
    parsePlanFile: vi.fn().mockResolvedValue(plan),
    findNextUncheckedTasks: vi.fn().mockReturnValue([]),
  };
}

function makeConfig(): LongRunningConfig {
  return {
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
  };
}

function makeExecutorOpts(overrides: Partial<WaveExecutorOptions> = {}): WaveExecutorOptions {
  return {
    sessionManager: makeSessionManager(),
    config: makeConfig(),
    planParser: makePlanParser(makeParsedPlan(1)),
    costTracker: new CostTrackerV2(),
    logger,
    heartbeat: { stop: vi.fn(), updateStage: vi.fn() },
    planFilePath: '/tmp/PLAN.md',
    ...overrides,
  };
}

describe('WaveExecutor.executeWave', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('1: single wave happy path — session completes, returns WaveState status completed', async () => {
    const plan = makeParsedPlan(1, true);
    const executor = new WaveExecutor(makeExecutorOpts({ planParser: makePlanParser(plan) }));
    const wave = makeParsedWave(1, true);

    const result = await executor.executeWave(wave, { waves: [] });

    expect(result.status).toBe('completed');
    expect(result.number).toBe(1);
    expect(result.startedAt).toBeTruthy();
    expect(result.completedAt).toBeTruthy();
    expect(result.error).toBeNull();
  });

  it('2: multi-wave sequential — 3 waves each gets a fresh session (createSession called 3 times)', async () => {
    const sessionManager = makeSessionManager();
    const plan = makeParsedPlan(3, true);
    const executor = new WaveExecutor(
      makeExecutorOpts({ sessionManager, planParser: makePlanParser(plan) }),
    );

    for (const wave of plan.waves) {
      await executor.executeWave(wave, { waves: [] });
    }

    expect(sessionManager.createSession).toHaveBeenCalledTimes(3);
    expect(sessionManager.createSession).toHaveBeenNthCalledWith(1, 'Wave 1');
    expect(sessionManager.createSession).toHaveBeenNthCalledWith(2, 'Wave 2');
    expect(sessionManager.createSession).toHaveBeenNthCalledWith(3, 'Wave 3');
  });

  it('3: wave timeout — monitorSession returns completed:false, WaveState has status failed with error message', async () => {
    const sessionManager = makeSessionManager({
      monitorSession: vi.fn().mockResolvedValue({ completed: false, reason: 'timeout' }),
    });
    const executor = new WaveExecutor(makeExecutorOpts({ sessionManager }));
    const wave = makeParsedWave(1, false);

    const result = await executor.executeWave(wave, { waves: [] });

    expect(result.status).toBe('failed');
    expect(result.error).toMatch(/timeout/i);
    expect(result.error).toContain('90 minutes');
  });

  it('3b: session creation failure — createSession returns null, WaveState has status failed', async () => {
    const sessionManager = makeSessionManager({
      createSession: vi.fn().mockResolvedValue(null),
    });
    const executor = new WaveExecutor(makeExecutorOpts({ sessionManager }));

    const result = await executor.executeWave(makeParsedWave(1), { waves: [] });

    expect(result.status).toBe('failed');
    expect(result.error).toBeTruthy();
  });

  it('4: tasks not all checked after session completes — WaveState status is failed', async () => {
    const planWithIncomplete = makeParsedPlan(1, false);
    const executor = new WaveExecutor(
      makeExecutorOpts({ planParser: makePlanParser(planWithIncomplete) }),
    );

    const result = await executor.executeWave(makeParsedWave(1, false), { waves: [] });

    expect(result.status).toBe('failed');
    expect(result.error).toBeTruthy();
  });

  it('5: onWaveStart and onWaveComplete callbacks fired', async () => {
    const onWaveStart = vi.fn();
    const onWaveComplete = vi.fn();
    const plan = makeParsedPlan(1, true);
    const executor = new WaveExecutor(
      makeExecutorOpts({ planParser: makePlanParser(plan), onWaveStart, onWaveComplete }),
    );

    const result = await executor.executeWave(makeParsedWave(1, true), { waves: [] });

    expect(onWaveStart).toHaveBeenCalledWith(1);
    expect(onWaveComplete).toHaveBeenCalledWith(result);
  });

  it('6: monitorSession called with 90-minute timeout', async () => {
    const sessionManager = makeSessionManager();
    const plan = makeParsedPlan(1, true);
    const executor = new WaveExecutor(
      makeExecutorOpts({ sessionManager, planParser: makePlanParser(plan) }),
    );

    await executor.executeWave(makeParsedWave(1, true), { waves: [] });

    expect(sessionManager.monitorSession).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ timeoutMs: 90 * 60 * 1000 }),
    );
  });
});

describe('runAllWaves', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function makeRunOpts(
    plan: ParsedPlan,
    executorOpts: Partial<WaveExecutorOptions> = {},
    overrides: {
      costBreaker?: { shouldStop: ReturnType<typeof vi.fn> };
      betweenWavePush?: ReturnType<typeof vi.fn>;
      planSync?: { updateWaveState: ReturnType<typeof vi.fn> };
      installRunner?: { checkAndRunIfChanged: ReturnType<typeof vi.fn> };
    } = {},
  ) {
    const costBreaker = overrides.costBreaker ?? {
      shouldStop: vi.fn().mockReturnValue({ stop: false }),
    };
    const betweenWavePush = overrides.betweenWavePush ?? vi.fn().mockResolvedValue(undefined);
    const planSync = overrides.planSync ?? {
      updateWaveState: vi.fn().mockResolvedValue(undefined),
    };
    const installRunner = overrides.installRunner ?? {
      checkAndRunIfChanged: vi.fn().mockResolvedValue(false),
    };

    const opts = makeExecutorOpts({ planParser: makePlanParser(plan), ...executorOpts });
    const executor = new WaveExecutor(opts);

    return { executor, costBreaker, betweenWavePush, planSync, installRunner };
  }

  it('7: wave failure stops loop — runAllWaves stops after first failed wave, subsequent waves not attempted', async () => {
    const plan = makeParsedPlan(3, false);
    const sessionManager = makeSessionManager({
      monitorSession: vi.fn().mockResolvedValue({ completed: false, reason: 'timeout' }),
    });
    const { executor, costBreaker, betweenWavePush, planSync, installRunner } = makeRunOpts(plan, {
      sessionManager,
    });

    const result = await runAllWaves({
      plan,
      executor,
      installRunner,
      costBreaker,
      betweenWavePush,
      planSync,
      logger,
    });

    expect(result.waves).toHaveLength(1);
    expect(result.waves[0]!.status).toBe('failed');
    expect(betweenWavePush).not.toHaveBeenCalled();
  });

  it('8: install re-run triggered after each successful wave', async () => {
    const plan = makeParsedPlan(2, true);
    const { executor, costBreaker, betweenWavePush, planSync, installRunner } = makeRunOpts(plan);

    await runAllWaves({
      plan,
      executor,
      installRunner,
      costBreaker,
      betweenWavePush,
      planSync,
      logger,
    });

    expect(installRunner.checkAndRunIfChanged).toHaveBeenCalledTimes(2);
  });

  it('9: cost breaker blocks wave 2 — shouldStop returns true for wave 2, loop stops after wave 1', async () => {
    const plan = makeParsedPlan(3, true);
    const costBreaker = {
      shouldStop: vi.fn().mockImplementation((waveNumber: number) => ({
        stop: waveNumber >= 2,
      })),
    };
    const { executor, betweenWavePush, planSync, installRunner } = makeRunOpts(plan);

    const result = await runAllWaves({
      plan,
      executor,
      installRunner,
      costBreaker,
      betweenWavePush,
      planSync,
      logger,
    });

    expect(result.waves).toHaveLength(1);
    expect(result.waves[0]!.status).toBe('completed');
    expect(costBreaker.shouldStop).toHaveBeenCalledWith(2);
  });

  it('10: cost breaker NOT called for wave 1 — shouldStop never called when only wave 1 runs', async () => {
    const plan = makeParsedPlan(1, true);
    const costBreaker = { shouldStop: vi.fn().mockReturnValue({ stop: false }) };
    const { executor, betweenWavePush, planSync, installRunner } = makeRunOpts(plan);

    await runAllWaves({
      plan,
      executor,
      installRunner,
      costBreaker,
      betweenWavePush,
      planSync,
      logger,
    });

    expect(costBreaker.shouldStop).not.toHaveBeenCalled();
  });

  it('11: betweenWavePush and planSync.updateWaveState called after each successful wave', async () => {
    const plan = makeParsedPlan(2, true);
    const { executor, costBreaker, betweenWavePush, planSync, installRunner } = makeRunOpts(plan);

    await runAllWaves({
      plan,
      executor,
      installRunner,
      costBreaker,
      betweenWavePush,
      planSync,
      logger,
    });

    expect(betweenWavePush).toHaveBeenCalledTimes(2);
    expect(planSync.updateWaveState).toHaveBeenCalledTimes(2);
  });

  it('12: all 3 waves complete — returns WaveStateArray with 3 completed states', async () => {
    const plan = makeParsedPlan(3, true);
    const { executor, costBreaker, betweenWavePush, planSync, installRunner } = makeRunOpts(plan);

    const result = await runAllWaves({
      plan,
      executor,
      installRunner,
      costBreaker,
      betweenWavePush,
      planSync,
      logger,
    });

    expect(result.waves).toHaveLength(3);
    expect(result.waves.every((w) => w.status === 'completed')).toBe(true);
  });
});
