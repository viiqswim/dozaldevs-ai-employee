import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionDetector } from '../../../src/workers/lib/completion-detector.js';
import type { Logger } from '../../../src/workers/lib/completion-detector.js';
import type { SessionManager } from '../../../src/workers/lib/session-manager.js';
import type { LongRunningConfig } from '../../../src/workers/config/long-running.js';

function makeLogger(): Logger {
  return {
    step: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeSessionManager(): SessionManager {
  return {
    createSession: vi.fn(),
    injectTaskPrompt: vi.fn(),
    monitorSession: vi.fn(),
    abortSession: vi.fn(),
    sendFixPrompt: vi.fn(),
  };
}

const MINIMAL_CONFIG: LongRunningConfig = {
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
} as LongRunningConfig;

describe('CompletionDetector', () => {
  let sessionManager: SessionManager;
  let logger: Logger;
  let detector: CompletionDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionManager = makeSessionManager();
    logger = makeLogger();
    detector = new CompletionDetector({ sessionManager, logger, config: MINIMAL_CONFIG });
  });

  it('returns completed when SSE monitorSession returns completed:true', async () => {
    vi.mocked(sessionManager.monitorSession).mockResolvedValueOnce({
      completed: true,
      reason: 'idle',
    });

    const result = await detector.waitForCompletion({
      sessionId: 'sess-1',
      waveNumber: 1,
      timeoutMs: 60_000,
    });

    expect(result.outcome).toBe('completed');
    expect(result.reason).toBe('SSE completion signal');
    expect(result.idleCount).toBe(0);
    expect(sessionManager.monitorSession).toHaveBeenCalledTimes(1);
  });

  it('falls back to polling when SSE times out', async () => {
    vi.mocked(sessionManager.monitorSession)
      .mockResolvedValueOnce({ completed: false, reason: 'timeout' })
      .mockResolvedValueOnce({ completed: true, reason: 'idle' });

    const result = await detector.waitForCompletion({
      sessionId: 'sess-2',
      waveNumber: 1,
      timeoutMs: 120_000,
    });

    expect(result.outcome).toBe('completed');
    expect(sessionManager.monitorSession).toHaveBeenCalledTimes(2);
    expect(logger.step).toHaveBeenCalledWith(
      '🔄',
      'polling fallback activated',
      expect.any(Object),
    );
  });

  it('returns idle after 3 consecutive non-completing polls', async () => {
    vi.mocked(sessionManager.monitorSession)
      .mockResolvedValueOnce({ completed: false, reason: 'timeout' })
      .mockResolvedValueOnce({ completed: false, reason: 'idle' })
      .mockResolvedValueOnce({ completed: false, reason: 'idle' })
      .mockResolvedValueOnce({ completed: false, reason: 'idle' });

    const result = await detector.waitForCompletion({
      sessionId: 'sess-3',
      waveNumber: 2,
      timeoutMs: 300_000,
    });

    expect(result.outcome).toBe('idle');
    expect(result.reason).toBe('3 consecutive idle polls');
    expect(result.idleCount).toBe(3);
    expect(logger.step).toHaveBeenCalledWith('💤', 'idle detected', expect.any(Object));
  });

  it('respects total timeout: returns timeout when elapsed exceeds timeoutMs', async () => {
    vi.useFakeTimers();

    vi.mocked(sessionManager.monitorSession).mockImplementation(async (_sessionId, opts) => {
      const ms = opts?.timeoutMs ?? 1000;
      await new Promise<void>((resolve) => setTimeout(resolve, ms));
      return { completed: false, reason: 'timeout' as const };
    });

    const completionPromise = detector.waitForCompletion({
      sessionId: 'sess-4',
      waveNumber: 1,
      timeoutMs: 35_000,
    });

    await vi.runAllTimersAsync();
    const result = await completionPromise;

    expect(result.outcome).toBe('timeout');
    expect(result.reason).toContain('Total timeout exceeded');

    vi.useRealTimers();
  });

  it('returns error when SSE monitorSession throws', async () => {
    vi.mocked(sessionManager.monitorSession).mockRejectedValueOnce(
      new Error('SSE connection failed'),
    );

    const result = await detector.waitForCompletion({
      sessionId: 'sess-5',
      waveNumber: 1,
      timeoutMs: 60_000,
    });

    expect(result.outcome).toBe('error');
    expect(result.reason).toContain('SSE error');
    expect(result.reason).toContain('SSE connection failed');
    expect(result.idleCount).toBe(0);
  });

  it('returns error when a polling call throws', async () => {
    vi.mocked(sessionManager.monitorSession)
      .mockResolvedValueOnce({ completed: false, reason: 'timeout' })
      .mockRejectedValueOnce(new Error('poll network failure'));

    const result = await detector.waitForCompletion({
      sessionId: 'sess-6',
      waveNumber: 1,
      timeoutMs: 120_000,
    });

    expect(result.outcome).toBe('error');
    expect(result.reason).toContain('Poll error');
    expect(result.reason).toContain('poll network failure');
  });

  it('logs SSE monitoring started and completed step transitions', async () => {
    vi.mocked(sessionManager.monitorSession).mockResolvedValueOnce({
      completed: true,
      reason: 'idle',
    });

    await detector.waitForCompletion({
      sessionId: 'sess-7',
      waveNumber: 3,
      timeoutMs: 60_000,
    });

    expect(logger.step).toHaveBeenCalledWith('📡', 'SSE monitoring started', expect.any(Object));
    expect(logger.step).toHaveBeenCalledWith('✅', 'completed', expect.any(Object));
  });

  it('resets idle count to zero when a poll completes successfully mid-sequence', async () => {
    vi.mocked(sessionManager.monitorSession)
      .mockResolvedValueOnce({ completed: false, reason: 'timeout' })
      .mockResolvedValueOnce({ completed: false, reason: 'idle' })
      .mockResolvedValueOnce({ completed: false, reason: 'idle' })
      .mockResolvedValueOnce({ completed: true, reason: 'idle' });

    const result = await detector.waitForCompletion({
      sessionId: 'sess-8',
      waveNumber: 1,
      timeoutMs: 300_000,
    });

    expect(result.outcome).toBe('completed');
    expect(sessionManager.monitorSession).toHaveBeenCalledTimes(4);
  });
});
