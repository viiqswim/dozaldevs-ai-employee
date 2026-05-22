import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { ModelRecommendationEntry } from '@/lib/types';
import type { ModelRecommendation } from '@/lib/gateway';

function formatCostEstimate(usd: number): string {
  if (usd === 0) return 'Free';
  if (usd < 0.0001) return '< $0.0001 per run';
  if (usd < 0.01) return `$${usd.toFixed(4)} per run`;
  return `$${usd.toFixed(3)} per run`;
}

function costTierLabel(tier: ModelRecommendationEntry['tiers']['cost']): string {
  const map: Record<typeof tier, string> = {
    free: 'Free',
    budget: 'Budget',
    standard: 'Standard',
    premium: 'Premium',
  };
  return map[tier];
}

function qualityTierLabel(tier: ModelRecommendationEntry['tiers']['quality']): string {
  const map: Record<typeof tier, string> = {
    basic: 'Basic quality',
    capable: 'Capable',
    advanced: 'Advanced',
    frontier: 'Frontier',
  };
  return map[tier];
}

function speedTierLabel(tier: ModelRecommendationEntry['tiers']['speed']): string {
  const map: Record<typeof tier, string> = {
    slow: 'Slower',
    moderate: 'Moderate speed',
    fast: 'Fast',
  };
  return map[tier];
}

interface ModelCardProps {
  entry: ModelRecommendationEntry;
  label: string;
  labelVariant?: 'recommended' | 'affordable' | 'premium';
  isSelected: boolean;
  onSelect: (modelId: string) => void;
}

function ModelCard({
  entry,
  label,
  labelVariant = 'affordable',
  isSelected,
  onSelect,
}: ModelCardProps) {
  const isRecommended = labelVariant === 'recommended';

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.modelId)}
      className={cn(
        'w-full rounded-lg border bg-card px-5 py-4 text-left transition-all',
        isSelected && isRecommended
          ? 'border-emerald-500 ring-2 ring-emerald-500/30'
          : isSelected
            ? 'border-primary ring-2 ring-primary/20'
            : isRecommended
              ? 'border-emerald-500/60 hover:border-emerald-500'
              : 'border-border hover:border-muted-foreground/50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isRecommended && (
              <Badge className="bg-emerald-500 text-white border-transparent text-xs">
                Recommended
              </Badge>
            )}
            {labelVariant === 'affordable' && (
              <Badge variant="secondary" className="text-xs">
                More affordable
              </Badge>
            )}
            {labelVariant === 'premium' && (
              <Badge variant="secondary" className="text-xs">
                Higher quality
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm font-medium leading-tight">{entry.displayName}</p>
          <p className="text-xs text-muted-foreground">{entry.provider}</p>
        </div>

        <div
          className={cn(
            'mt-1 h-4 w-4 shrink-0 rounded-full border-2 transition-all',
            isSelected
              ? isRecommended
                ? 'border-emerald-500 bg-emerald-500'
                : 'border-primary bg-primary'
              : 'border-muted-foreground/30',
          )}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {costTierLabel(entry.tiers.cost)}
        </span>
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {qualityTierLabel(entry.tiers.quality)}
        </span>
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {speedTierLabel(entry.tiers.speed)}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {formatCostEstimate(entry.costEstimate.perTaskUsd)}
      </p>
    </button>
  );
}

interface ModelRecommendationStepProps {
  recommendation: ModelRecommendation | null;
  defaultModel: string;
  onConfirm: (modelId: string) => void;
  onBack: () => void;
  loading?: boolean;
}

export function ModelRecommendationStep({
  recommendation,
  defaultModel,
  onConfirm,
  onBack,
  loading,
}: ModelRecommendationStepProps) {
  const [selectedModel, setSelectedModel] = useState<string>(
    recommendation?.recommended?.modelId ?? defaultModel,
  );

  const hasCards =
    recommendation &&
    (recommendation.recommended ||
      recommendation.cheaperAlternative ||
      recommendation.premiumAlternative);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card px-5 py-4">
        <p className="text-sm font-medium">Choose an AI model for your employee</p>
        {hasCards ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Based on your answers, here are our top picks. The recommended option is pre-selected.
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            We couldn't find a recommendation right now. Your employee will use our standard model.
            You can always change this later.
          </p>
        )}
      </div>

      {hasCards && (
        <div className="space-y-3">
          {recommendation.recommended && (
            <ModelCard
              entry={recommendation.recommended}
              label="Recommended"
              labelVariant="recommended"
              isSelected={selectedModel === recommendation.recommended.modelId}
              onSelect={setSelectedModel}
            />
          )}
          {recommendation.cheaperAlternative && (
            <ModelCard
              entry={recommendation.cheaperAlternative}
              label="More affordable"
              labelVariant="affordable"
              isSelected={selectedModel === recommendation.cheaperAlternative.modelId}
              onSelect={setSelectedModel}
            />
          )}
          {recommendation.premiumAlternative && (
            <ModelCard
              entry={recommendation.premiumAlternative}
              label="Higher quality"
              labelVariant="premium"
              isSelected={selectedModel === recommendation.premiumAlternative.modelId}
              onSelect={setSelectedModel}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Back to questions
        </button>
        <Button onClick={() => onConfirm(selectedModel)} disabled={loading}>
          {loading ? 'Saving…' : 'Save Employee'}
        </Button>
      </div>
    </div>
  );
}
