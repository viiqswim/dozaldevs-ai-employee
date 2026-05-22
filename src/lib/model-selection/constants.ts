import type { ScoreBreakdown } from './types.js';

export const COST_TIER_THRESHOLDS = {
  free: 0,
  budget: 0.5,
  standard: 3.0,
} as const;

export const QUALITY_TIER_THRESHOLDS = {
  basic: 40,
  capable: 60,
  advanced: 80,
} as const;

export const SPEED_GRADE_THRESHOLDS = {
  slowMax: 15,
  moderateMax: 40,
  latencyCutoffSeconds: 3,
} as const;

export const TOOL_RELIABILITY_THRESHOLDS = {
  unreliable: 0.05,
  usable: 0.02,
  reliable: 0.01,
} as const;

export const SCORING_WEIGHTS: ScoreBreakdown = {
  quality: 0.35,
  cost: 0.25,
  speed: 0.15,
  toolReliability: 0.25,
};

export const QUALITY_COMPOSITE_WEIGHTS = {
  qualityIndex: 0.2,
  agenticScore: 0.3,
  toolUseScore: 0.25,
  instructionFollowingScore: 0.15,
  nonHallucinationRate: 0.1,
} as const;

export const AVG_TASK_INPUT_TOKENS = 2000;
export const AVG_TASK_OUTPUT_TOKENS = 1000;
