import { describe, it, expect } from 'vitest';
import { matchModels, recommendModels } from '../matcher.js';
import type { ModelCatalogRow } from '../matcher.js';
import type { TaskProfile } from '../types.js';

function makeModel(overrides: Partial<ModelCatalogRow> = {}): ModelCatalogRow {
  return {
    id: 'aaaaaaaa-0000-4000-8000-000000000001',
    model_id: 'test/model',
    display_name: 'Test Model',
    provider: 'test',
    context_window: 128_000,
    input_cost_per_million: 1.0,
    output_cost_per_million: 2.0,
    is_free: false,
    throughput_tokens_per_sec: 100,
    latency_seconds: 0.5,
    tool_call_error_rate: 0.001,
    structured_output_error_rate: null,
    quality_index: 70,
    agentic_score: null,
    tool_use_score: null,
    instruction_following_score: null,
    non_hallucination_rate: null,
    supports_tools: true,
    supports_structured_output: true,
    is_active: true,
    deleted_at: null,
    ...overrides,
  };
}

const DEFAULT_PROFILE: TaskProfile = {
  toolIntensity: 'none',
  outputQualityBar: 'medium',
  contextNeeds: 'small',
  latencySensitivity: 'normal',
  costSensitivity: 'medium',
  domain: null,
};

describe('matchModels', () => {
  it('returns empty array when catalog is empty', () => {
    expect(matchModels(DEFAULT_PROFILE, [])).toEqual([]);
  });

  it('filters out inactive models', () => {
    const catalog = [makeModel({ model_id: 'active/model', is_active: true }), makeModel({ model_id: 'inactive/model', is_active: false })];
    const results = matchModels(DEFAULT_PROFILE, catalog);
    expect(results).toHaveLength(1);
    expect(results[0].modelId).toBe('active/model');
  });

  it('filters out soft-deleted models', () => {
    const catalog = [makeModel({ model_id: 'live/model', deleted_at: null }), makeModel({ model_id: 'deleted/model', deleted_at: new Date() })];
    const results = matchModels(DEFAULT_PROFILE, catalog);
    expect(results).toHaveLength(1);
    expect(results[0].modelId).toBe('live/model');
  });

  it('filters out models without tool support when profile requires tools', () => {
    const profile: TaskProfile = { ...DEFAULT_PROFILE, toolIntensity: 'light' };
    const catalog = [makeModel({ model_id: 'with-tools/model', supports_tools: true }), makeModel({ model_id: 'no-tools/model', supports_tools: false })];
    const results = matchModels(profile, catalog);
    expect(results).toHaveLength(1);
    expect(results[0].modelId).toBe('with-tools/model');
  });

  it('includes models without tool support when toolIntensity is none', () => {
    const profile: TaskProfile = { ...DEFAULT_PROFILE, toolIntensity: 'none' };
    const catalog = [makeModel({ model_id: 'no-tools/model', supports_tools: false })];
    const results = matchModels(profile, catalog);
    expect(results).toHaveLength(1);
  });

  it('filters out models with insufficient context window for large needs', () => {
    const profile: TaskProfile = { ...DEFAULT_PROFILE, contextNeeds: 'large' };
    const catalog = [makeModel({ model_id: 'large-ctx/model', context_window: 100_000 }), makeModel({ model_id: 'small-ctx/model', context_window: 99_999 })];
    const results = matchModels(profile, catalog);
    expect(results).toHaveLength(1);
    expect(results[0].modelId).toBe('large-ctx/model');
  });

  it('filters out models with insufficient context window for medium needs', () => {
    const profile: TaskProfile = { ...DEFAULT_PROFILE, contextNeeds: 'medium' };
    const catalog = [makeModel({ model_id: 'enough-ctx/model', context_window: 32_000 }), makeModel({ model_id: 'too-small/model', context_window: 31_999 })];
    const results = matchModels(profile, catalog);
    expect(results).toHaveLength(1);
    expect(results[0].modelId).toBe('enough-ctx/model');
  });

  it('returns results sorted by totalScore descending', () => {
    const highScorer = makeModel({
      model_id: 'high-score/model',
      is_free: true,
      quality_index: 80,
      throughput_tokens_per_sec: 100,
      latency_seconds: 0.5,
      tool_call_error_rate: 0.001,
    });
    const lowScorer = makeModel({
      model_id: 'low-score/model',
      is_free: false,
      input_cost_per_million: 30,
      output_cost_per_million: 30,
      quality_index: 5,
      throughput_tokens_per_sec: 5,
      latency_seconds: 20,
      tool_call_error_rate: 0.1,
    });
    const results = matchModels(DEFAULT_PROFILE, [lowScorer, highScorer]);
    expect(results[0].modelId).toBe('high-score/model');
    expect(results[1].modelId).toBe('low-score/model');
  });

  it('computes cost estimate using avg task token counts', () => {
    const model = makeModel({
      is_free: false,
      input_cost_per_million: 2.0,
      output_cost_per_million: 4.0,
    });
    const [scored] = matchModels(DEFAULT_PROFILE, [model]);
    expect(scored.costEstimate.perTaskUsd).toBeCloseTo(
      (2000 / 1_000_000) * 2.0 + (1000 / 1_000_000) * 4.0,
      8,
    );
  });
});

describe('recommendModels', () => {
  it('returns all null when catalog is empty', () => {
    const result = recommendModels(DEFAULT_PROFILE, []);
    expect(result.recommended).toBeNull();
    expect(result.cheaperAlternative).toBeNull();
    expect(result.premiumAlternative).toBeNull();
  });

  it('returns the model as recommended with null alternatives when only one model exists', () => {
    const catalog = [makeModel({ model_id: 'solo/model' })];
    const result = recommendModels(DEFAULT_PROFILE, catalog);
    expect(result.recommended).not.toBeNull();
    expect(result.recommended?.modelId).toBe('solo/model');
    expect(result.cheaperAlternative).toBeNull();
    expect(result.premiumAlternative).toBeNull();
  });

  it('identifies a cheaper alternative when a model with a lower cost tier exists', () => {
    const topModel = makeModel({
      model_id: 'top/model',
      is_free: false,
      input_cost_per_million: 1.0,
      output_cost_per_million: 2.0,
      quality_index: 85,
      throughput_tokens_per_sec: 100,
      latency_seconds: 0.5,
      tool_call_error_rate: 0.001,
    });
    const cheaperModel = makeModel({
      model_id: 'cheap/model',
      is_free: false,
      input_cost_per_million: 0.4,
      output_cost_per_million: 0.4,
      quality_index: 55,
      throughput_tokens_per_sec: 100,
      latency_seconds: 0.5,
      tool_call_error_rate: 0.001,
    });
    const result = recommendModels(DEFAULT_PROFILE, [topModel, cheaperModel]);
    expect(result.recommended?.modelId).toBe('top/model');
    expect(result.cheaperAlternative?.modelId).toBe('cheap/model');
  });

  it('identifies a premium alternative when a model with a higher quality tier exists', () => {
    const freeCapable = makeModel({
      model_id: 'free-capable/model',
      is_free: true,
      quality_index: 55,
      throughput_tokens_per_sec: 100,
      latency_seconds: 0.5,
      tool_call_error_rate: 0.001,
    });
    const premiumFrontier = makeModel({
      model_id: 'premium-frontier/model',
      is_free: false,
      input_cost_per_million: 1.0,
      output_cost_per_million: 2.0,
      quality_index: 85,
      throughput_tokens_per_sec: 100,
      latency_seconds: 0.5,
      tool_call_error_rate: 0.001,
    });
    const result = recommendModels(DEFAULT_PROFILE, [freeCapable, premiumFrontier]);
    expect(result.recommended?.modelId).toBe('free-capable/model');
    expect(result.premiumAlternative?.modelId).toBe('premium-frontier/model');
  });

  it('returns null cheaperAlternative when recommended is already the free (cheapest) tier', () => {
    const freeModel = makeModel({
      model_id: 'free/model',
      is_free: true,
      quality_index: 70,
      throughput_tokens_per_sec: 100,
      latency_seconds: 0.5,
      tool_call_error_rate: 0.001,
    });
    const paidModel = makeModel({
      model_id: 'paid/model',
      is_free: false,
      input_cost_per_million: 1.0,
      output_cost_per_million: 2.0,
      quality_index: 50,
    });
    const result = recommendModels(DEFAULT_PROFILE, [freeModel, paidModel]);
    expect(result.recommended?.modelId).toBe('free/model');
    expect(result.cheaperAlternative).toBeNull();
  });

  it('returns null premiumAlternative when recommended already has frontier quality', () => {
    const frontierBudget = makeModel({
      model_id: 'frontier-budget/model',
      is_free: false,
      input_cost_per_million: 0.4,
      output_cost_per_million: 0.4,
      quality_index: 85,
      throughput_tokens_per_sec: 100,
      latency_seconds: 0.5,
      tool_call_error_rate: 0.001,
    });
    const basicFree = makeModel({
      model_id: 'basic-free/model',
      is_free: true,
      quality_index: 30,
      throughput_tokens_per_sec: 100,
      latency_seconds: 0.5,
      tool_call_error_rate: 0.001,
    });
    const result = recommendModels(DEFAULT_PROFILE, [frontierBudget, basicFree]);
    expect(result.recommended?.modelId).toBe('frontier-budget/model');
    expect(result.premiumAlternative).toBeNull();
  });
});
