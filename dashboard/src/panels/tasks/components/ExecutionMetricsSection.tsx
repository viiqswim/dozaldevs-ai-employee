import { cn, formatCostUsd } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/ui/stat-card';
import type { Execution } from '@/lib/types';
import { EXECUTION_STATUS_COLORS } from './task-detail-helpers';

interface ExecutionMetricsSectionProps {
  execution: Execution | null;
  isAutoPass: boolean;
  totalTokens: string;
  costDisplay: string;
  durationDisplay: string;
  heartbeatDisplay: string;
  execCostTotal: number;
  deliveryCostTotal: number;
  totalCostAllPhases: number;
}

export function ExecutionMetricsSection({
  execution,
  isAutoPass,
  totalTokens,
  costDisplay,
  durationDisplay,
  heartbeatDisplay,
  execCostTotal,
  deliveryCostTotal,
  totalCostAllPhases,
}: ExecutionMetricsSectionProps) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4" data-testid="execution-metrics">
      <h2 className="text-sm font-semibold">Execution Metrics</h2>
      {execution ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-md border bg-muted/30 p-3 text-center">
            <div className="flex justify-center">
              <Badge
                variant="outline"
                className={cn(
                  'border-transparent text-xs font-medium',
                  EXECUTION_STATUS_COLORS[execution.status] ?? 'bg-muted text-muted-foreground',
                )}
              >
                {execution.status}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Status</p>
          </div>
          <StatCard label="Tokens" value={totalTokens} testId="execution-tokens" />
          <StatCard label="Cost" value={costDisplay} testId="execution-cost" />
          <StatCard label="Duration" value={durationDisplay} testId="execution-duration" />
          <StatCard label="Heartbeat" value={heartbeatDisplay} />
          {totalCostAllPhases > 0 && (
            <>
              <StatCard label="Execution Cost" value={formatCostUsd(execCostTotal)} />
              <StatCard
                label="Delivery Cost"
                value={deliveryCostTotal > 0 ? formatCostUsd(deliveryCostTotal) : '—'}
              />
            </>
          )}
        </div>
      ) : null}
      {!execution &&
        (isAutoPass ? (
          <div className="flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <span className="text-base leading-none">⚡</span>
            <p className="text-sm text-zinc-400">
              Auto-completed — no worker execution. This task was resolved during triage without
              spawning a worker.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No execution data</p>
        ))}
    </div>
  );
}
