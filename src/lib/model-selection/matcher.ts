import type {
  TaskProfile,
  ModelScore,
  ModelRecommendation,
  CostTier,
  QualityTier,
} from './types.js';
import { SCORING_WEIGHTS, AVG_TASK_INPUT_TOKENS, AVG_TASK_OUTPUT_TOKENS } from './constants.js';
import {
  computeQualityComposite,
  computeQualityTier,
  computeCostTier,
  computeSpeedGrade,
  computeToolReliability,
} from './tiers.js';

export interface ModelCatalogRow {
  id: string;
  model_id: string;
  display_name: string;
  provider: string;
  context_window: number;
  input_cost_per_million: number;
  output_cost_per_million: number;
  is_free: boolean;
  throughput_tokens_per_sec: number | null;
  latency_seconds: number | null;
  tool_call_error_rate: number | null;
  structured_output_error_rate: number | null;
  quality_index: number | null;
  agentic_score: number | null;
  tool_use_score: number | null;
  instruction_following_score: number | null;
  non_hallucination_rate: number | null;
  supports_tools: boolean;
  supports_structured_output: boolean;
  is_active: boolean;
  deleted_at: Date | null;
}

const COST_TIER_ORDER: CostTier[] = ['free', 'budget', 'standard', 'premium'];
const QUALITY_TIER_ORDER: QualityTier[] = ['basic', 'capable', 'advanced', 'frontier'];

function speedGradeToScore(grade: 'slow' | 'moderate' | 'fast'): number {
  if (grade === 'fast') return 100;
  if (grade === 'moderate') return 60;
  return 30;
}

function toolReliabilityToScore(
  reliability: 'unreliable' | 'usable' | 'reliable' | 'rock_solid',
): number {
  if (reliability === 'rock_solid') return 100;
  if (reliability === 'reliable') return 80;
  if (reliability === 'usable') return 50;
  return 20;
}

function computeCostScore(model: ModelCatalogRow): number {
  if (model.is_free) return 100;
  const avgCost = (model.input_cost_per_million + model.output_cost_per_million) / 2;
  const raw = 100 - (Math.log10(avgCost + 0.01) + 2) * 30;
  return Math.max(0, Math.min(100, raw));
}

function computeAdjustedWeights(profile: TaskProfile): {
  quality: number;
  cost: number;
  speed: number;
  toolReliability: number;
} {
  let quality = SCORING_WEIGHTS.quality;
  let cost = SCORING_WEIGHTS.cost;
  let speed = SCORING_WEIGHTS.speed;
  let toolReliability = SCORING_WEIGHTS.toolReliability;

  if (profile.costSensitivity === 'high') {
    quality -= 0.1;
    cost += 0.15;
    speed -= 0.05;
  }

  if (profile.latencySensitivity === 'critical') {
    speed += 0.1;
    cost -= 0.1;
  }

  if (profile.toolIntensity === 'heavy') {
    toolReliability += 0.1;
    cost -= 0.1;
  }

  const total = quality + cost + speed + toolReliability;
  return {
    quality: quality / total,
    cost: cost / total,
    speed: speed / total,
    toolReliability: toolReliability / total,
  };
}

export function matchModels(profile: TaskProfile, catalog: ModelCatalogRow[]): ModelScore[] {
  const filtered = catalog.filter((model) => {
    if (!model.is_active || model.deleted_at !== null) return false;
    if (profile.toolIntensity !== 'none' && !model.supports_tools) return false;
    if (profile.contextNeeds === 'large' && model.context_window < 100_000) return false;
    if (profile.contextNeeds === 'medium' && model.context_window < 32_000) return false;
    return true;
  });

  const weights = computeAdjustedWeights(profile);

  const scored: ModelScore[] = filtered.map((model) => {
    const qualityMetrics = {
      qualityIndex: model.quality_index,
      agenticScore: model.agentic_score,
      toolUseScore: model.tool_use_score,
      instructionFollowingScore: model.instruction_following_score,
      nonHallucinationRate: model.non_hallucination_rate,
    };

    const qualityScore = computeQualityComposite(qualityMetrics);
    const costScore = computeCostScore(model);
    const speedGrade = computeSpeedGrade(model.throughput_tokens_per_sec, model.latency_seconds);
    const speedScore = speedGradeToScore(speedGrade);
    const toolReliabilityGrade = computeToolReliability(model.tool_call_error_rate);
    const toolReliabilityScore = toolReliabilityToScore(toolReliabilityGrade);

    const totalScore =
      weights.quality * qualityScore +
      weights.cost * costScore +
      weights.speed * speedScore +
      weights.toolReliability * toolReliabilityScore;

    const perTaskUsd =
      (AVG_TASK_INPUT_TOKENS / 1_000_000) * model.input_cost_per_million +
      (AVG_TASK_OUTPUT_TOKENS / 1_000_000) * model.output_cost_per_million;

    return {
      modelId: model.model_id,
      displayName: model.display_name,
      provider: model.provider,
      totalScore,
      breakdown: {
        quality: qualityScore,
        cost: costScore,
        speed: speedScore,
        toolReliability: toolReliabilityScore,
      },
      tiers: {
        cost: computeCostTier(
          model.input_cost_per_million,
          model.output_cost_per_million,
          model.is_free,
        ),
        quality: computeQualityTier(qualityMetrics),
        speed: speedGrade,
        toolReliability: toolReliabilityGrade,
      },
      costEstimate: {
        perTaskUsd,
        monthlyUsd: null,
      },
    };
  });

  return scored.sort((a, b) => b.totalScore - a.totalScore);
}

export function recommendModels(
  profile: TaskProfile,
  catalog: ModelCatalogRow[],
): ModelRecommendation {
  const ranked = matchModels(profile, catalog);

  if (ranked.length === 0) {
    return { recommended: null, cheaperAlternative: null, premiumAlternative: null };
  }

  const recommended = ranked[0];
  const rest = ranked.slice(1);

  const recommendedCostRank = COST_TIER_ORDER.indexOf(recommended.tiers.cost);
  const recommendedQualityRank = QUALITY_TIER_ORDER.indexOf(recommended.tiers.quality);

  const cheaperAlternative =
    recommendedCostRank === 0
      ? null
      : (rest.find((m) => COST_TIER_ORDER.indexOf(m.tiers.cost) < recommendedCostRank) ?? null);

  const premiumAlternative =
    recommendedQualityRank === QUALITY_TIER_ORDER.length - 1
      ? null
      : (rest.find((m) => QUALITY_TIER_ORDER.indexOf(m.tiers.quality) > recommendedQualityRank) ??
        null);

  return { recommended, cheaperAlternative, premiumAlternative };
}
