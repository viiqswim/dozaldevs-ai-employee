import { describe, expect, it, beforeEach } from 'vitest';
import { TokenTracker } from '../../../src/workers/lib/token-tracker.js';

describe('TokenTracker', () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    tracker = new TokenTracker();
  });

  it('starts with zero accumulated values', () => {
    const result = tracker.getAccumulated();
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.primaryModelId).toBe('');
  });

  it('addUsage accumulates promptTokens and completionTokens across calls', () => {
    tracker.addUsage({ promptTokens: 100, completionTokens: 50, estimatedCostUsd: 0.001, model: 'gpt-4o' });
    tracker.addUsage({ promptTokens: 200, completionTokens: 75, estimatedCostUsd: 0.002, model: 'gpt-4o' });

    const result = tracker.getAccumulated();
    expect(result.promptTokens).toBe(300);
    expect(result.completionTokens).toBe(125);
  });

  it('addUsage accumulates estimatedCostUsd', () => {
    tracker.addUsage({ promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0.0012, model: 'a' });
    tracker.addUsage({ promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0.0034, model: 'a' });

    const result = tracker.getAccumulated();
    expect(result.estimatedCostUsd).toBe(0.0046);
  });

  it('estimatedCostUsd precision: 4 decimal places after multiple additions', () => {
    tracker.addUsage({ promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0.1111, model: 'a' });
    tracker.addUsage({ promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0.2222, model: 'a' });
    tracker.addUsage({ promptTokens: 0, completionTokens: 0, estimatedCostUsd: 0.3333, model: 'a' });

    const result = tracker.getAccumulated();
    expect(result.estimatedCostUsd).toBe(0.6666);
    const decimals = result.estimatedCostUsd.toString().split('.')[1]?.length ?? 0;
    expect(decimals).toBeLessThanOrEqual(4);
  });

  it('primaryModelId is set from the first addUsage call', () => {
    tracker.addUsage({ promptTokens: 10, completionTokens: 5, estimatedCostUsd: 0, model: 'first-model' });
    tracker.addUsage({ promptTokens: 10, completionTokens: 5, estimatedCostUsd: 0, model: 'second-model' });

    expect(tracker.getAccumulated().primaryModelId).toBe('first-model');
  });

  it('primaryModelId stays as first model across many calls', () => {
    for (let i = 0; i < 5; i++) {
      tracker.addUsage({ promptTokens: 1, completionTokens: 1, estimatedCostUsd: 0, model: `model-${i}` });
    }
    expect(tracker.getAccumulated().primaryModelId).toBe('model-0');
  });

  it('getAccumulated returns a snapshot and does not mutate state', () => {
    tracker.addUsage({ promptTokens: 10, completionTokens: 5, estimatedCostUsd: 0.01, model: 'm' });

    const snap1 = tracker.getAccumulated();
    tracker.addUsage({ promptTokens: 20, completionTokens: 10, estimatedCostUsd: 0.02, model: 'm2' });
    const snap2 = tracker.getAccumulated();

    expect(snap1.promptTokens).toBe(10);
    expect(snap2.promptTokens).toBe(30);
  });

  it('reset clears all accumulated values', () => {
    tracker.addUsage({ promptTokens: 500, completionTokens: 250, estimatedCostUsd: 1.5, model: 'big-model' });
    tracker.reset();

    const result = tracker.getAccumulated();
    expect(result.promptTokens).toBe(0);
    expect(result.completionTokens).toBe(0);
    expect(result.estimatedCostUsd).toBe(0);
    expect(result.primaryModelId).toBe('');
  });

  it('after reset, primaryModelId is updated by the next addUsage call', () => {
    tracker.addUsage({ promptTokens: 1, completionTokens: 1, estimatedCostUsd: 0, model: 'old-model' });
    tracker.reset();
    tracker.addUsage({ promptTokens: 1, completionTokens: 1, estimatedCostUsd: 0, model: 'new-model' });

    expect(tracker.getAccumulated().primaryModelId).toBe('new-model');
  });

  it('single addUsage call returns correct totals', () => {
    tracker.addUsage({ promptTokens: 1000, completionTokens: 500, estimatedCostUsd: 0.0075, model: 'claude' });

    const result = tracker.getAccumulated();
    expect(result.promptTokens).toBe(1000);
    expect(result.completionTokens).toBe(500);
    expect(result.estimatedCostUsd).toBe(0.0075);
    expect(result.primaryModelId).toBe('claude');
  });
});
