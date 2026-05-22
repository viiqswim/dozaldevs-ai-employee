import type {
  CostTier,
  QualityTier,
  SpeedGrade,
  ToolReliability,
  QualityMetrics,
} from './types.js';
import {
  COST_TIER_THRESHOLDS,
  QUALITY_TIER_THRESHOLDS,
  SPEED_GRADE_THRESHOLDS,
  TOOL_RELIABILITY_THRESHOLDS,
  QUALITY_COMPOSITE_WEIGHTS,
} from './constants.js';

export function computeCostTier(
  inputCostPerMillion: number,
  outputCostPerMillion: number,
  isFree: boolean,
): CostTier {
  if (isFree) return 'free';
  const avg = (inputCostPerMillion + outputCostPerMillion) / 2;
  if (avg === 0) return 'free';
  if (avg < COST_TIER_THRESHOLDS.budget) return 'budget';
  if (avg < COST_TIER_THRESHOLDS.standard) return 'standard';
  return 'premium';
}

export function computeQualityComposite(metrics: QualityMetrics): number {
  const entries: Array<{ value: number; weight: number }> = [];

  if (metrics.qualityIndex != null) {
    entries.push({ value: metrics.qualityIndex, weight: QUALITY_COMPOSITE_WEIGHTS.qualityIndex });
  }
  if (metrics.agenticScore != null) {
    entries.push({ value: metrics.agenticScore, weight: QUALITY_COMPOSITE_WEIGHTS.agenticScore });
  }
  if (metrics.toolUseScore != null) {
    entries.push({ value: metrics.toolUseScore, weight: QUALITY_COMPOSITE_WEIGHTS.toolUseScore });
  }
  if (metrics.instructionFollowingScore != null) {
    entries.push({
      value: metrics.instructionFollowingScore,
      weight: QUALITY_COMPOSITE_WEIGHTS.instructionFollowingScore,
    });
  }
  if (metrics.nonHallucinationRate != null) {
    entries.push({
      value: metrics.nonHallucinationRate,
      weight: QUALITY_COMPOSITE_WEIGHTS.nonHallucinationRate,
    });
  }

  if (entries.length === 0) return 0;

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);
  return entries.reduce((sum, e) => sum + e.value * (e.weight / totalWeight), 0);
}

export function computeQualityTier(metrics: QualityMetrics): QualityTier {
  const composite = computeQualityComposite(metrics);
  if (composite < QUALITY_TIER_THRESHOLDS.basic) return 'basic';
  if (composite < QUALITY_TIER_THRESHOLDS.capable) return 'capable';
  if (composite < QUALITY_TIER_THRESHOLDS.advanced) return 'advanced';
  return 'frontier';
}

export function computeSpeedGrade(
  throughputTokensPerSec: number | null,
  latencySeconds: number | null,
): SpeedGrade {
  if (throughputTokensPerSec == null) return 'slow';
  if (
    throughputTokensPerSec > SPEED_GRADE_THRESHOLDS.moderateMax &&
    (latencySeconds == null || latencySeconds < SPEED_GRADE_THRESHOLDS.latencyCutoffSeconds)
  ) {
    return 'fast';
  }
  if (throughputTokensPerSec > SPEED_GRADE_THRESHOLDS.slowMax) return 'moderate';
  return 'slow';
}

export function computeToolReliability(toolCallErrorRate: number | null): ToolReliability {
  if (toolCallErrorRate == null) return 'unreliable';
  if (toolCallErrorRate < TOOL_RELIABILITY_THRESHOLDS.reliable) return 'rock_solid';
  if (toolCallErrorRate < TOOL_RELIABILITY_THRESHOLDS.usable) return 'reliable';
  if (toolCallErrorRate < TOOL_RELIABILITY_THRESHOLDS.unreliable) return 'usable';
  return 'unreliable';
}
