import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import type { EmployeeRule, FeedbackEvent } from '@/lib/types';

export function is403(err: Error): boolean {
  return err.message.includes('403') || err.message.toLowerCase().includes('permission denied');
}

export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function buildArchetypeFilter(selectedIdsKey: string): Record<string, string> {
  if (!selectedIdsKey) return {};
  const ids = selectedIdsKey.split(',');
  if (ids.length === 1) return { archetype_id: `eq.${ids[0]}` };
  return { archetype_id: `in.(${ids.join(',')})` };
}

export function SkeletonRow({ cols }: { cols: number }) {
  return (
    <TableRow>
      {Array.from({ length: cols }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </TableCell>
      ))}
    </TableRow>
  );
}

function PermissionWarning({ table }: { table: string }) {
  return (
    <div className="rounded-md border border-yellow-400 bg-yellow-50 p-4 text-sm dark:border-yellow-600 dark:bg-yellow-950/30">
      <p className="font-semibold text-yellow-800 dark:text-yellow-300">
        PostgREST access not configured for this table.
      </p>
      <p className="mt-1 font-mono text-yellow-700 dark:text-yellow-400">
        Run:{' '}
        <code className="rounded bg-yellow-100 px-1 dark:bg-yellow-900">
          GRANT SELECT ON {table} TO anon;
        </code>{' '}
        in your database.
      </p>
    </div>
  );
}

export function ErrorState({
  error,
  table,
  onRetry,
}: {
  error: Error;
  table: string;
  onRetry: () => void;
}) {
  if (is403(error)) {
    return (
      <div className="p-6">
        <PermissionWarning table={table} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-semibold">Failed to load {table}</p>
        <p className="mt-1 text-destructive/80">{error.message}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
          onClick={onRetry}
        >
          Retry
        </Button>
      </div>
    </div>
  );
}

export const RULE_STATUS_CLASSES: Record<EmployeeRule['status'], string> = {
  confirmed:
    'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  proposed:
    'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
  awaiting_input:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  rejected:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
};

export function RuleStatusBadge({ status }: { status: EmployeeRule['status'] }) {
  return (
    <Badge variant="outline" className={RULE_STATUS_CLASSES[status]}>
      {status}
    </Badge>
  );
}

export const EVENT_TYPE_CLASSES: Record<FeedbackEvent['event_type'], string> = {
  teaching:
    'bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800',
  feedback:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  rejection_reason:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  rejection:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  edit_diff:
    'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
};

export function EventTypeBadge({ type }: { type: FeedbackEvent['event_type'] }) {
  return (
    <Badge variant="outline" className={EVENT_TYPE_CLASSES[type]}>
      {type}
    </Badge>
  );
}
