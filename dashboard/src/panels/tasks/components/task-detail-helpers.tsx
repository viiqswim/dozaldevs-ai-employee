import { cn } from '@/lib/utils';

export const EXECUTION_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  running: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-slate-100 text-slate-700',
};

export const DELIVERABLE_STATUSES = new Set([
  'Submitting',
  'Reviewing',
  'Approved',
  'Delivering',
  'Done',
]);

export const EVENT_TYPE_COLORS: Record<string, string> = {
  teaching: 'bg-blue-50 text-blue-700 border-blue-200',
  feedback: 'bg-violet-50 text-violet-700 border-violet-200',
  rejection_reason: 'bg-red-50 text-red-700 border-red-200',
  rejection: 'bg-red-50 text-red-700 border-red-200',
  edit_diff: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-muted', className)} />;
}

export function TaskDetailSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <Skeleton className="h-6 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-48" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function isStringRecord(val: unknown): val is Record<string, string> {
  return (
    val !== null &&
    typeof val === 'object' &&
    !Array.isArray(val) &&
    Object.values(val as object).every((v) => typeof v === 'string')
  );
}

export function asRecordUnknown(val: unknown): Record<string, unknown> {
  if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}
