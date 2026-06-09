import { describe, it, expect } from 'vitest';
import { GO_MODEL_MAP, resolveProvider } from '../../../src/lib/go-models.js';

describe('GO_MODEL_MAP', () => {
  it('contains all 14 expected Go model entries', () => {
    const expectedEntries: [string, string][] = [
      ['minimax/minimax-m2.7', 'minimax-m2.7'],
      ['minimax/minimax-m2.5', 'minimax-m2.5'],
      ['minimax/minimax-m3', 'minimax-m3'],
      ['deepseek/deepseek-v4-flash', 'deepseek-v4-flash'],
      ['deepseek/deepseek-v4-pro', 'deepseek-v4-pro'],
      ['xiaomi/mimo-v2.5', 'mimo-v2.5'],
      ['xiaomi/mimo-v2.5-pro', 'mimo-v2.5-pro'],
      ['alibaba/qwen3.7-max', 'qwen3.7-max'],
      ['alibaba/qwen3.7-plus', 'qwen3.7-plus'],
      ['alibaba/qwen3.6-plus', 'qwen3.6-plus'],
      ['zhipu/glm-5.1', 'glm-5.1'],
      ['zhipu/glm-5', 'glm-5'],
      ['moonshot/kimi-k2.5', 'kimi-k2.5'],
      ['moonshot/kimi-k2.6', 'kimi-k2.6'],
    ];

    expect(GO_MODEL_MAP.size).toBe(14);
    for (const [openRouterId, goId] of expectedEntries) {
      expect(GO_MODEL_MAP.get(openRouterId)).toBe(goId);
    }
  });
});

describe('resolveProvider', () => {
  it('Go model + key present → opencode-go provider with Go model ID', () => {
    const result = resolveProvider('minimax/minimax-m2.7', true);
    expect(result).toEqual({
      providerID: 'opencode-go',
      modelID: 'minimax-m2.7',
      goEndpointType: 'anthropic',
    });
  });

  it('Go model + key absent → openrouter provider with cleaned model ID', () => {
    const result = resolveProvider('minimax/minimax-m2.7', false);
    expect(result).toEqual({ providerID: 'openrouter', modelID: 'minimax/minimax-m2.7' });
  });

  it('non-Go model + key present → openrouter provider', () => {
    const result = resolveProvider('google/gemini-flash', true);
    expect(result).toEqual({ providerID: 'openrouter', modelID: 'google/gemini-flash' });
  });

  it('model with openrouter/ prefix → strips prefix and resolves to Go', () => {
    const result = resolveProvider('openrouter/minimax/minimax-m2.7', true);
    expect(result).toEqual({
      providerID: 'opencode-go',
      modelID: 'minimax-m2.7',
      goEndpointType: 'anthropic',
    });
  });

  it('model with openrouter/ prefix + key absent → strips prefix and returns openrouter', () => {
    const result = resolveProvider('openrouter/minimax/minimax-m2.7', false);
    expect(result).toEqual({ providerID: 'openrouter', modelID: 'minimax/minimax-m2.7' });
  });

  it('deepseek model + key present → opencode-go with correct Go ID', () => {
    const result = resolveProvider('deepseek/deepseek-v4-flash', true);
    expect(result).toEqual({
      providerID: 'opencode-go',
      modelID: 'deepseek-v4-flash',
      goEndpointType: 'openai',
    });
  });

  it('unknown model with openrouter/ prefix + key absent → strips prefix and returns openrouter', () => {
    const result = resolveProvider('openrouter/some-unknown-model', false);
    expect(result).toEqual({ providerID: 'openrouter', modelID: 'some-unknown-model' });
  });
});
