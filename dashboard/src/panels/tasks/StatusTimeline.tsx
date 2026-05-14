import { STATUS_COLORS } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { TaskStatusLog } from '@/lib/types';

interface StatusTimelineProps {
  logs: TaskStatusLog[];
}

function statusDotColor(status: string): string {
  const colorMap: Record<string, string> = {
    Received: 'bg-slate-400',
    Triaging: 'bg-blue-400',
    AwaitingInput: 'bg-purple-400',
    Ready: 'bg-cyan-400',
    Executing: 'bg-blue-500',
    Validating: 'bg-indigo-400',
    Submitting: 'bg-yellow-400',
    Reviewing: 'bg-amber-400',
    Approved: 'bg-emerald-400',
    Delivering: 'bg-teal-400',
    Done: 'bg-green-500',
    Failed: 'bg-red-500',
    Cancelled: 'bg-gray-400',
  };
  return colorMap[status] ?? 'bg-slate-300';
}

function statusTextColor(status: string): string {
  const colorMap: Record<string, string> = {
    Received: 'text-slate-700',
    Triaging: 'text-blue-700',
    AwaitingInput: 'text-purple-700',
    Ready: 'text-cyan-700',
    Executing: 'text-blue-800',
    Validating: 'text-indigo-700',
    Submitting: 'text-yellow-800',
    Reviewing: 'text-amber-800',
    Approved: 'text-emerald-700',
    Delivering: 'text-teal-700',
    Done: 'text-green-800',
    Failed: 'text-red-800',
    Cancelled: 'text-gray-600',
  };
  return colorMap[status] ?? 'text-slate-700';
}

export function StatusTimeline({ logs }: StatusTimelineProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No status history yet</p>;
  }

  return (
    <div className="relative">
      <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

      <div className="space-y-4">
        {logs.map((log, index) => (
          <div key={log.id} className="relative flex items-start gap-4 pl-6">
            <div
              className={cn(
                'absolute left-0 top-[5px] h-[15px] w-[15px] rounded-full border-2 border-background',
                statusDotColor(log.to_status),
              )}
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {log.from_status ? (
                  <>
                    <span className={cn('text-sm font-medium', statusTextColor(log.from_status))}>
                      {log.from_status}
                    </span>
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className={cn('text-sm font-semibold', statusTextColor(log.to_status))}>
                      {log.to_status}
                    </span>
                  </>
                ) : (
                  <span className={cn('text-sm font-semibold', statusTextColor(log.to_status))}>
                    {log.to_status}
                  </span>
                )}
                {index === logs.length - 1 && (
                  <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    current
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{log.actor}</span>
                <span>·</span>
                <span>{formatRelativeTime(log.created_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
