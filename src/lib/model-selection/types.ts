export type CostTier = 'free' | 'budget' | 'standard' | 'premium';
export type QualityTier = 'basic' | 'capable' | 'advanced' | 'frontier';
export type SpeedGrade = 'slow' | 'moderate' | 'fast';
export type ToolReliability = 'unreliable' | 'usable' | 'reliable' | 'rock_solid';

export interface TaskProfile {
  toolIntensity: 'none' | 'light' | 'heavy';
  outputQualityBar: 'low' | 'medium' | 'high';
  contextNeeds: 'small' | 'medium' | 'large';
  latencySensitivity: 'relaxed' | 'normal' | 'critical';
  costSensitivity: 'low' | 'medium' | 'high';
  domain: string | null;
}

export interface UserAnswers {
  audience: 'external' | 'internal';
  frequency: 'frequent' | 'daily' | 'rare';
  speedPreference: 'fast' | 'relaxed';
}

export interface CostEstimate {
  perTaskUsd: number;
  monthlyUsd: number | null;
}

export interface ScoreBreakdown {
  quality: number;
  cost: number;
  speed: number;
  toolReliability: number;
}

export interface ModelTiers {
  cost: CostTier;
  quality: QualityTier;
  speed: SpeedGrade;
  toolReliability: ToolReliability;
}

export interface ModelScore {
  modelId: string;
  displayName: string;
  provider: string;
  totalScore: number;
  breakdown: ScoreBreakdown;
  tiers: ModelTiers;
  costEstimate: CostEstimate;
}

export interface ModelRecommendation {
  recommended: ModelScore | null;
  cheaperAlternative: ModelScore | null;
  premiumAlternative: ModelScore | null;
}

export interface QualityMetrics {
  qualityIndex: number | null;
  agenticScore: number | null;
  toolUseScore: number | null;
  instructionFollowingScore: number | null;
  nonHallucinationRate: number | null;
}
