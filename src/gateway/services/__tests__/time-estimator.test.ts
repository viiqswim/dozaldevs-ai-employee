import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../../lib/call-llm.js';
import { TimeEstimator, shouldReEstimate, getEffectiveEstimate } from '../time-estimator.js';

type MockCallLLM = ReturnType<typeof vi.fn>;

function makeCallLLMResult(content: string): MockCallLLM {
  return vi.fn().mockResolvedValue({
    content,
    model: 'deepseek/deepseek-v4-flash',
    promptTokens: 10,
    completionTokens: 5,
    estimatedCostUsd: 0.0001,
    latencyMs: 50,
  });
}

const sampleArchetype = {
  role_name: 'guest-reply-bot',
  instructions: 'Reply to guest messages from Hostfully inbox.',
  system_prompt: null,
  deliverable_type: 'hostfully_message',
};

describe('TimeEstimator', () => {
  describe('estimate()', () => {
    it('returns integer when LLM responds with a plain number string', async () => {
      const mockCallLLM = makeCallLLMResult('15');
      const estimator = new TimeEstimator(mockCallLLM as typeof callLLM);
      const result = await estimator.estimate(sampleArchetype);
      expect(result).toBe(15);
    });

    it('extracts first integer when LLM responds with prose around a number', async () => {
      const mockCallLLM = makeCallLLMResult('About 15-20 minutes');
      const estimator = new TimeEstimator(mockCallLLM as typeof callLLM);
      const result = await estimator.estimate(sampleArchetype);
      expect(result).toBe(15);
    });

    it('returns null when LLM response contains no integer', async () => {
      const mockCallLLM = makeCallLLMResult('I cannot estimate this');
      const estimator = new TimeEstimator(mockCallLLM as typeof callLLM);
      const result = await estimator.estimate(sampleArchetype);
      expect(result).toBeNull();
    });

    it('returns null and does not rethrow when LLM throws', async () => {
      const mockCallLLM = vi.fn().mockRejectedValue(new Error('Network error'));
      const estimator = new TimeEstimator(mockCallLLM as typeof callLLM);
      const result = await estimator.estimate(sampleArchetype);
      expect(result).toBeNull();
    });
  });
});

describe('shouldReEstimate()', () => {
  it('returns true when instructions is in changed fields', () => {
    expect(shouldReEstimate(['instructions'])).toBe(true);
  });

  it('returns false when only non-content fields changed', () => {
    expect(shouldReEstimate(['notification_channel'])).toBe(false);
  });

  it('returns true when content and non-content fields are mixed', () => {
    expect(shouldReEstimate(['instructions', 'notification_channel'])).toBe(true);
  });

  it('returns false for empty array', () => {
    expect(shouldReEstimate([])).toBe(false);
  });
});

describe('getEffectiveEstimate()', () => {
  it('returns override when both override and haiku estimate are set', () => {
    expect(
      getEffectiveEstimate({ estimated_manual_minutes: 10, estimated_manual_minutes_override: 25 }),
    ).toBe(25);
  });

  it('returns haiku estimate when override is null', () => {
    expect(
      getEffectiveEstimate({
        estimated_manual_minutes: 10,
        estimated_manual_minutes_override: null,
      }),
    ).toBe(10);
  });

  it('returns null when both are null', () => {
    expect(
      getEffectiveEstimate({
        estimated_manual_minutes: null,
        estimated_manual_minutes_override: null,
      }),
    ).toBeNull();
  });
});
