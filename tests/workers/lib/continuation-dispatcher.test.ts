import { describe, it, expect, vi } from 'vitest';
import type { ParsedPlan, ParsedTask } from '../../../src/workers/lib/plan-parser.js';
import type { SessionManager } from '../../../src/workers/lib/session-manager.js';
import type { LongRunningConfig } from '../../../src/workers/config/long-running.js';
import type { PlanParserDeps } from '../../../src/workers/lib/continuation-dispatcher.js';
import { ContinuationDispatcher } from '../../../src/workers/lib/continuation-dispatcher.js';

function makeTask(number: number, title: string, completed = false): ParsedTask {
  return { number, title, completed };
}

function makeParsedPlan(waves: { number: number; tasks: ParsedTask[] }[]): ParsedPlan {
  const allTasks = waves.flatMap((w) => w.tasks);
  return {
    waves,
    totalWaves: waves.length,
    totalTasks: allTasks.length,
    completedTasks: allTasks.filter((t) => t.completed).length,
  };
}

function makeConfig(overrides?: Partial<LongRunningConfig>): LongRunningConfig {
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
    ...overrides,
  };
}

function makeSessionManager(): SessionManager {
  return {
    createSession: vi.fn().mockResolvedValue('sess-1'),
    injectTaskPrompt: vi.fn().mockResolvedValue(true),
    monitorSession: vi.fn().mockResolvedValue({ completed: true, reason: 'idle' }),
    abortSession: vi.fn().mockResolvedValue(undefined),
    sendFixPrompt: vi.fn().mockResolvedValue(true),
  };
}

function makePlanParser(parsed: ParsedPlan, uncheckedTasks: ParsedTask[]): PlanParserDeps {
  return {
    parsePlanFile: vi.fn().mockReturnValue(parsed),
    findNextUncheckedTasks: vi.fn().mockReturnValue(uncheckedTasks),
  };
}

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'info',
  } as unknown as import('pino').Logger;
}

describe('ContinuationDispatcher', () => {
  describe('dispatchContinuation', () => {
    it('dispatches when unchecked tasks exist and returns dispatched: true', async () => {
      const tasks = [makeTask(1, 'Write unit tests'), makeTask(2, 'Add types')];
      const plan = makeParsedPlan([{ number: 1, tasks }]);
      const sessionManager = makeSessionManager();
      const planParser = makePlanParser(plan, tasks);

      const dispatcher = new ContinuationDispatcher({
        config: makeConfig(),
        planParser,
        sessionManager,
        logger: makeLogger(),
      });

      const result = await dispatcher.dispatchContinuation({
        waveNumber: 1,
        sessionId: 'sess-abc',
        planContent: 'dummy content',
        continuationCount: 0,
      });

      expect(result.dispatched).toBe(true);
      expect(result.reason).toBe('sent 2 tasks');
      expect(sessionManager.injectTaskPrompt).toHaveBeenCalledOnce();
      const [calledSessionId, calledMessage] = (
        sessionManager.injectTaskPrompt as ReturnType<typeof vi.fn>
      ).mock.calls[0] as [string, string];
      expect(calledSessionId).toBe('sess-abc');
      expect(calledMessage).toContain('Wave 1');
      expect(calledMessage).toContain('Write unit tests');
    });

    it('returns dispatched: false with reason "all tasks checked" when no unchecked tasks remain', async () => {
      const tasks = [makeTask(1, 'Done task', true)];
      const plan = makeParsedPlan([{ number: 1, tasks }]);
      const planParser = makePlanParser(plan, []);
      const sessionManager = makeSessionManager();

      const dispatcher = new ContinuationDispatcher({
        config: makeConfig(),
        planParser,
        sessionManager,
        logger: makeLogger(),
      });

      const result = await dispatcher.dispatchContinuation({
        waveNumber: 1,
        sessionId: 'sess-abc',
        planContent: 'dummy content',
        continuationCount: 0,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('all tasks checked');
      expect(sessionManager.injectTaskPrompt).not.toHaveBeenCalled();
    });

    it('returns dispatched: false with reason "max continuations reached" when continuationCount equals maxContinuationsPerWave', async () => {
      const tasks = [makeTask(1, 'Pending task'), makeTask(2, 'Another task')];
      const plan = makeParsedPlan([{ number: 1, tasks }]);
      const planParser = makePlanParser(plan, tasks);
      const sessionManager = makeSessionManager();

      const dispatcher = new ContinuationDispatcher({
        config: makeConfig({ maxContinuationsPerWave: 5 }),
        planParser,
        sessionManager,
        logger: makeLogger(),
      });

      const result = await dispatcher.dispatchContinuation({
        waveNumber: 1,
        sessionId: 'sess-abc',
        planContent: 'dummy content',
        continuationCount: 5,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('max continuations reached');
      expect(sessionManager.injectTaskPrompt).not.toHaveBeenCalled();
    });

    it('sends exactly 3 tasks even when more than 3 unchecked tasks exist', async () => {
      const allTasks = Array.from({ length: 10 }, (_, i) => makeTask(i + 1, `Task ${i + 1}`));
      const plan = makeParsedPlan([{ number: 1, tasks: allTasks }]);
      const first3 = allTasks.slice(0, 3);
      const planParser = makePlanParser(plan, first3);
      const sessionManager = makeSessionManager();

      const dispatcher = new ContinuationDispatcher({
        config: makeConfig(),
        planParser,
        sessionManager,
        logger: makeLogger(),
      });

      const result = await dispatcher.dispatchContinuation({
        waveNumber: 1,
        sessionId: 'sess-xyz',
        planContent: 'dummy content',
        continuationCount: 0,
      });

      expect(result.dispatched).toBe(true);
      expect(result.reason).toBe('sent 3 tasks');

      const [, message] = (sessionManager.injectTaskPrompt as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string];
      const taskLines = message.split('\n').filter((l) => l.startsWith('- [ ]'));
      expect(taskLines).toHaveLength(3);

      expect(planParser.findNextUncheckedTasks).toHaveBeenCalledWith(
        expect.objectContaining({
          waves: expect.arrayContaining([expect.objectContaining({ number: 1 })]),
        }),
        3,
      );
    });

    it('scopes to the current wave only — tasks from other waves are not included', async () => {
      const wave1Tasks = [makeTask(1, 'Wave 1 Task A'), makeTask(2, 'Wave 1 Task B')];
      const wave2Tasks = [makeTask(1, 'Wave 2 Task X'), makeTask(2, 'Wave 2 Task Y')];
      const plan = makeParsedPlan([
        { number: 1, tasks: wave1Tasks },
        { number: 2, tasks: wave2Tasks },
      ]);

      const planParser = makePlanParser(plan, wave2Tasks);
      const sessionManager = makeSessionManager();

      const dispatcher = new ContinuationDispatcher({
        config: makeConfig(),
        planParser,
        sessionManager,
        logger: makeLogger(),
      });

      await dispatcher.dispatchContinuation({
        waveNumber: 2,
        sessionId: 'sess-w2',
        planContent: 'dummy content',
        continuationCount: 0,
      });

      const [wavePlan] = (planParser.findNextUncheckedTasks as ReturnType<typeof vi.fn>).mock
        .calls[0] as [ParsedPlan, number];
      expect(wavePlan.waves).toHaveLength(1);
      expect(wavePlan.waves[0]!.number).toBe(2);
      expect(wavePlan.waves[0]!.tasks).toEqual(wave2Tasks);

      const [, message] = (sessionManager.injectTaskPrompt as ReturnType<typeof vi.fn>).mock
        .calls[0] as [string, string];
      expect(message).toContain('Wave 2');
      expect(message).toContain('Wave 2 Task X');
    });

    it('returns dispatched: false when injectTaskPrompt fails', async () => {
      const tasks = [makeTask(1, 'Some task')];
      const plan = makeParsedPlan([{ number: 1, tasks }]);
      const planParser = makePlanParser(plan, tasks);
      const sessionManager = makeSessionManager();
      (sessionManager.injectTaskPrompt as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const dispatcher = new ContinuationDispatcher({
        config: makeConfig(),
        planParser,
        sessionManager,
        logger: makeLogger(),
      });

      const result = await dispatcher.dispatchContinuation({
        waveNumber: 1,
        sessionId: 'sess-fail',
        planContent: 'dummy content',
        continuationCount: 0,
      });

      expect(result.dispatched).toBe(false);
      expect(result.reason).toBe('failed to inject prompt');
    });
  });
});
