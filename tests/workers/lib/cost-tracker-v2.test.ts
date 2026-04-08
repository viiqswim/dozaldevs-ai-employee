import { describe, it, expect, beforeEach } from 'vitest';
import { CostTrackerV2 } from '../../../src/workers/lib/cost-tracker-v2.js';

describe('CostTrackerV2', () => {
  let tracker: CostTrackerV2;

  beforeEach(() => {
    tracker = new CostTrackerV2();
  });

  it('records a single step and accumulates in wave', () => {
    tracker.recordStep(1, 100, 50, 'pnpm test');
    expect(tracker.getWaveTotals(1)).toEqual({ tokensIn: 100, tokensOut: 50 });
  });

  it('accumulates multiple steps in same wave', () => {
    tracker.recordStep(1, 100, 50, 'tool-a');
    tracker.recordStep(1, 200, 80, 'tool-b');
    expect(tracker.getWaveTotals(1)).toEqual({ tokensIn: 300, tokensOut: 130 });
  });

  it('tracks multiple waves independently', () => {
    tracker.recordStep(1, 100, 50);
    tracker.recordStep(2, 200, 80);
    tracker.recordStep(3, 150, 60);
    expect(tracker.getWaveTotals(1)).toEqual({ tokensIn: 100, tokensOut: 50 });
    expect(tracker.getWaveTotals(2)).toEqual({ tokensIn: 200, tokensOut: 80 });
    expect(tracker.getWaveTotals(3)).toEqual({ tokensIn: 150, tokensOut: 60 });
  });

  it('getTaskTotals sums across all waves', () => {
    tracker.recordStep(1, 100, 50);
    tracker.recordStep(2, 200, 80);
    const totals = tracker.getTaskTotals();
    expect(totals.tokensIn).toBe(300);
    expect(totals.tokensOut).toBe(130);
  });

  it('returns zeros for unknown wave', () => {
    expect(tracker.getWaveTotals(99)).toEqual({ tokensIn: 0, tokensOut: 0 });
  });

  it('reset clears all state', () => {
    tracker.recordStep(1, 100, 50);
    tracker.reset();
    expect(tracker.getWaveTotals(1)).toEqual({ tokensIn: 0, tokensOut: 0 });
    expect(tracker.getTaskTotals()).toEqual({ tokensIn: 0, tokensOut: 0 });
  });

  it('accepts null toolName', () => {
    tracker.recordStep(1, 100, 50, null);
    expect(tracker.getWaveTotals(1)).toEqual({ tokensIn: 100, tokensOut: 50 });
  });
});
