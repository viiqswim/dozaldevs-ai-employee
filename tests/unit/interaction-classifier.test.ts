import { describe, it, expect, vi } from 'vitest';
import type { callLLM } from '../../src/lib/call-llm.js';
import { InteractionClassifier } from '../../src/gateway/services/interaction-classifier.js';

function makeLLMResponse(content: string) {
  return {
    content,
    promptTokens: 10,
    completionTokens: 5,
  };
}

describe('InteractionClassifier.classifyIntent() — retry and fallback behavior', () => {
  it('retries when first result is empty and succeeds on second call', async () => {
    const mockCallLLM = vi
      .fn()
      .mockResolvedValueOnce(makeLLMResponse(''))
      .mockResolvedValueOnce(makeLLMResponse('task'));

    const classifier = new InteractionClassifier(mockCallLLM as unknown as typeof callLLM);
    const result = await classifier.classifyIntent('Please generate a summary');

    expect(result).toBe('task');
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
  });

  it('returns "unclear" when both calls return empty strings', async () => {
    const mockCallLLM = vi
      .fn()
      .mockResolvedValueOnce(makeLLMResponse(''))
      .mockResolvedValueOnce(makeLLMResponse(''));

    const classifier = new InteractionClassifier(mockCallLLM as unknown as typeof callLLM);
    const result = await classifier.classifyIntent('some ambiguous text');

    expect(result).toBe('unclear');
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
  });

  it('returns immediately on valid first call without retrying', async () => {
    const mockCallLLM = vi.fn().mockResolvedValueOnce(makeLLMResponse('feedback'));

    const classifier = new InteractionClassifier(mockCallLLM as unknown as typeof callLLM);
    const result = await classifier.classifyIntent('Great work!');

    expect(result).toBe('feedback');
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
  });

  it('strips surrounding quotes from LLM response', async () => {
    const mockCallLLM = vi.fn().mockResolvedValueOnce(makeLLMResponse('"task"'));

    const classifier = new InteractionClassifier(mockCallLLM as unknown as typeof callLLM);
    const result = await classifier.classifyIntent('Do the thing');

    expect(result).toBe('task');
    expect(mockCallLLM).toHaveBeenCalledTimes(1);
  });

  it('returns "unclear" when both calls return unrecognized strings', async () => {
    const mockCallLLM = vi
      .fn()
      .mockResolvedValueOnce(makeLLMResponse('invalid_response'))
      .mockResolvedValueOnce(makeLLMResponse('also_invalid'));

    const classifier = new InteractionClassifier(mockCallLLM as unknown as typeof callLLM);
    const result = await classifier.classifyIntent('some text');

    expect(result).toBe('unclear');
    expect(mockCallLLM).toHaveBeenCalledTimes(2);
  });
});
