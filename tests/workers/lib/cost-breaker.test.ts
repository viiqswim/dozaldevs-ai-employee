import { describe, it, expect, vi } from 'vitest';
import { CostBreaker } from '../../../src/workers/lib/cost-breaker.js';
import { CostTrackerV2 } from '../../../src/workers/lib/cost-tracker-v2.js';
import type { LongRunningConfig } from '../../../src/workers/config/long-running.js';

describe('CostBreaker', () => {
  const mockConfig: LongRunningConfig = {
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

  it('wave 1 never stops — always returns stop: false', () => {
    const mockTracker = vi.mocked(new CostTrackerV2());
    mockTracker.getTaskTotals = vi.fn().mockReturnValue({ tokensIn: 0, tokensOut: 0 });

    const breaker = new CostBreaker({
      config: mockConfig,
      costTracker: mockTracker,
    });

    const result = breaker.shouldStop(1);

    expect(result.stop).toBe(false);
    expect(result.reason).toBe('wave 1 baseline');
    expect(result.totals).toEqual({ tokensIn: 0, tokensOut: 0 });
  });

  it('wave 2 checks totals — under cap returns stop: false', () => {
    const mockTracker = vi.mocked(new CostTrackerV2());
    mockTracker.getTaskTotals = vi.fn().mockReturnValue({
      tokensIn: 1000000,
      tokensOut: 500000,
    });

    const breaker = new CostBreaker({
      config: mockConfig,
      costTracker: mockTracker,
    });

    const result = breaker.shouldStop(2);

    expect(result.stop).toBe(false);
    expect(result.reason).toBe('within token cap');
    expect(result.totals).toEqual({ tokensIn: 1000000, tokensOut: 500000 });
  });

  it('over-cap triggers stop — totals exceed cap returns stop: true', () => {
    const mockTracker = vi.mocked(new CostTrackerV2());
    mockTracker.getTaskTotals = vi.fn().mockReturnValue({
      tokensIn: 2500000,
      tokensOut: 1600000,
    });

    const breaker = new CostBreaker({
      config: mockConfig,
      costTracker: mockTracker,
    });

    const result = breaker.shouldStop(3);

    expect(result.stop).toBe(true);
    expect(result.reason).toContain('token cap exceeded');
    expect(result.reason).toContain('4100000');
    expect(result.reason).toContain('4000000');
    expect(result.totals).toEqual({ tokensIn: 2500000, tokensOut: 1600000 });
  });

  it('under-cap allows continue — totals below cap returns stop: false', () => {
    const mockTracker = vi.mocked(new CostTrackerV2());
    mockTracker.getTaskTotals = vi.fn().mockReturnValue({
      tokensIn: 1500000,
      tokensOut: 1000000,
    });

    const breaker = new CostBreaker({
      config: mockConfig,
      costTracker: mockTracker,
    });

    const result = breaker.shouldStop(5);

    expect(result.stop).toBe(false);
    expect(result.reason).toBe('within token cap');
    expect(result.totals).toEqual({ tokensIn: 1500000, tokensOut: 1000000 });
  });

  it('token totals correctly summed — tokensIn + tokensOut compared to cap', () => {
    const mockTracker = vi.mocked(new CostTrackerV2());
    mockTracker.getTaskTotals = vi.fn().mockReturnValue({
      tokensIn: 3000000,
      tokensOut: 1000001,
    });

    const breaker = new CostBreaker({
      config: mockConfig,
      costTracker: mockTracker,
    });

    const result = breaker.shouldStop(2);

    expect(result.stop).toBe(true);
    expect(result.reason).toContain('4000001');
    expect(result.reason).toContain('4000000');
  });
});
