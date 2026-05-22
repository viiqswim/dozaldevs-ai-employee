import { describe, it, expect } from 'vitest';
import {
  computeCostTier,
  computeQualityComposite,
  computeQualityTier,
  computeSpeedGrade,
  computeToolReliability,
} from '../tiers.js';

describe('computeCostTier', () => {
  it('returns free when isFree is true regardless of costs', () => {
    expect(computeCostTier(10, 20, true)).toBe('free');
});

  it('returns budget when avg is just below threshold', () => {
    expect(computeCostTier(0.48, 0.5, false)).toBe('budget');
  });

  it('returns standard when avg equals budget threshold (0.50 — boundary not less than)', () => {
    expect(computeCostTier(0.5, 0.5, false)).toBe('standard');
  });

  it('returns standard when avg is between budget and standard thresholds', () => {
    expect(computeCostTier(1.0, 2.0, false)).toBe('standard');
  });

  it('returns standard when avg is just below standard threshold (2.99)', () => {
    expect(computeCostTier(2.99, 2.99, false)).toBe('standard');
  });

  it('returns premium when avg equals standard threshold (3.0 — boundary not less than)', () => {
    expect(computeCostTier(3.0, 3.0, false)).toBe('premium');
  });

  it('returns premium when avg is well above standard threshold', () => {
    expect(computeCostTier(10.0, 10.0, false)).toBe('premium');
  });
});

describe('computeQualityComposite', () => {
  it('returns 0 when all metrics are null', () => {
    expect(
      computeQualityComposite({
        qualityIndex: null,
        agenticScore: null,
        toolUseScore: null,
        instructionFollowingScore: null,
        nonHallucinationRate: null,
      }),
    ).toBe(0);
  });

  it('returns the metric value when only one metric is provided', () => {
    const result = computeQualityComposite({
      qualityIndex: 60,
      agenticScore: null,
      toolUseScore: null,
      instructionFollowingScore: null,
      nonHallucinationRate: null,
    });
    expect(result).toBe(60);
  });

  it('returns the common value when all metrics are the same', () => {
    const result = computeQualityComposite({
      qualityIndex: 75,
      agenticScore: 75,
      toolUseScore: 75,
      instructionFollowingScore: 75,
      nonHallucinationRate: 75,
    });
    expect(result).toBeCloseTo(75, 5);
  });

  it('computes correct weighted average when only two metrics are provided', () => {
    const result = computeQualityComposite({
      qualityIndex: 50,
      agenticScore: 80,
      toolUseScore: null,
      instructionFollowingScore: null,
      nonHallucinationRate: null,
    });
    expect(result).toBeCloseTo(68, 5);
  });
});

describe('computeQualityTier', () => {
  const nullMetrics = {
    agenticScore: null,
    toolUseScore: null,
    instructionFollowingScore: null,
    nonHallucinationRate: null,
  };

  it('returns basic when composite is 0 (all null)', () => {
    expect(computeQualityTier({ qualityIndex: null, ...nullMetrics })).toBe('basic');
  });

  it('returns basic when composite is just below 40', () => {
    expect(computeQualityTier({ qualityIndex: 39, ...nullMetrics })).toBe('basic');
  });

  it('returns capable when composite is exactly 40 (lower boundary)', () => {
    expect(computeQualityTier({ qualityIndex: 40, ...nullMetrics })).toBe('capable');
  });

  it('returns capable when composite is just below 60', () => {
    expect(computeQualityTier({ qualityIndex: 59, ...nullMetrics })).toBe('capable');
  });

  it('returns advanced when composite is exactly 60 (lower boundary)', () => {
    expect(computeQualityTier({ qualityIndex: 60, ...nullMetrics })).toBe('advanced');
  });

  it('returns advanced when composite is just below 80', () => {
    expect(computeQualityTier({ qualityIndex: 79, ...nullMetrics })).toBe('advanced');
  });

  it('returns frontier when composite is exactly 80 (lower boundary)', () => {
    expect(computeQualityTier({ qualityIndex: 80, ...nullMetrics })).toBe('frontier');
  });

  it('returns frontier when composite is above 80', () => {
    expect(computeQualityTier({ qualityIndex: 95, ...nullMetrics })).toBe('frontier');
  });
});

describe('computeSpeedGrade', () => {
  it('returns slow when throughput is null', () => {
    expect(computeSpeedGrade(null, null)).toBe('slow');
  });

  it('returns slow when throughput is null even with a low latency value', () => {
    expect(computeSpeedGrade(null, 0.5)).toBe('slow');
  });

  it('returns slow when throughput is at the slowMax boundary (15 — not greater than)', () => {
    expect(computeSpeedGrade(15, null)).toBe('slow');
  });

  it('returns slow when throughput is well below slowMax', () => {
    expect(computeSpeedGrade(5, null)).toBe('slow');
  });

  it('returns moderate when throughput is just above slowMax (16)', () => {
    expect(computeSpeedGrade(16, null)).toBe('moderate');
  });

  it('returns moderate when throughput is at moderateMax boundary (40 — not greater than)', () => {
    expect(computeSpeedGrade(40, null)).toBe('moderate');
  });

  it('returns fast when throughput exceeds moderateMax and latency is null', () => {
    expect(computeSpeedGrade(41, null)).toBe('fast');
  });

  it('returns fast when throughput exceeds moderateMax and latency is below 3s cutoff', () => {
    expect(computeSpeedGrade(41, 2.9)).toBe('fast');
  });

  it('returns moderate when throughput exceeds moderateMax but latency meets the 3s cutoff', () => {
    expect(computeSpeedGrade(41, 3.0)).toBe('moderate');
  });

  it('returns moderate when throughput exceeds moderateMax but latency exceeds cutoff', () => {
    expect(computeSpeedGrade(100, 5.0)).toBe('moderate');
  });
});

describe('computeToolReliability', () => {
  it('returns unreliable when rate is null', () => {
    expect(computeToolReliability(null)).toBe('unreliable');
  });

  it('returns rock_solid when rate is 0', () => {
    expect(computeToolReliability(0)).toBe('rock_solid');
  });

  it('returns rock_solid when rate is just below reliable threshold (0.009)', () => {
    expect(computeToolReliability(0.009)).toBe('rock_solid');
  });

  it('returns reliable when rate equals the reliable threshold (0.01 — boundary not less than)', () => {
    expect(computeToolReliability(0.01)).toBe('reliable');
  });

  it('returns reliable when rate is between reliable and usable thresholds', () => {
    expect(computeToolReliability(0.015)).toBe('reliable');
  });

  it('returns usable when rate equals the usable threshold (0.02 — boundary not less than)', () => {
    expect(computeToolReliability(0.02)).toBe('usable');
  });

  it('returns usable when rate is between usable and unreliable thresholds', () => {
    expect(computeToolReliability(0.04)).toBe('usable');
  });

  it('returns unreliable when rate equals the unreliable threshold (0.05 — boundary not less than)', () => {
    expect(computeToolReliability(0.05)).toBe('unreliable');
  });

  it('returns unreliable when rate exceeds unreliable threshold', () => {
    expect(computeToolReliability(0.15)).toBe('unreliable');
  });
});
