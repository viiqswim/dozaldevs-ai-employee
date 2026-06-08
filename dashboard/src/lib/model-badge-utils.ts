export function computeQualityTierLabel(
  qualityIndex: number | null,
): 'basic' | 'capable' | 'advanced' | 'frontier' | 'unknown' {
  if (qualityIndex === null) return 'unknown';
  if (qualityIndex < 40) return 'basic';
  if (qualityIndex < 60) return 'capable';
  if (qualityIndex < 80) return 'advanced';
  return 'frontier';
}

export const COST_TIER_CLASS: Record<string, string> = {
  free: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
  budget:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  standard:
    'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  premium:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
};

export const GATEWAY_LABEL: Record<string, string> = {
  'opencode-go': 'OpenCodeGo',
  openrouter: 'OpenRouter',
};

export const GATEWAY_CLASS: Record<string, string> = {
  'opencode-go':
    'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
  openrouter:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
};

export const QUALITY_TIER_CLASS: Record<string, string> = {
  basic:
    'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
  capable:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  advanced:
    'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300',
  frontier:
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  unknown: 'border-muted-foreground/20 text-muted-foreground',
};
