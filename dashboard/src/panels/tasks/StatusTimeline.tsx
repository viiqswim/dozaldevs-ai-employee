import { TERMINAL_STATUSES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { TaskStatusLog } from '@/lib/types';

interface StatusTimelineProps {
  logs: TaskStatusLog[];
  task?: { started_at: string | null; completed_at: string | null };
}

function formatTransitionDuration(ms: number): string {
  if (ms < 1000) return '< 1s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${minutes}m ${seconds}s`;
  return `${hours}h ${mins}m`;
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

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function StatusTimeline({ logs, task }: StatusTimelineProps) {
  if (logs.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No status history yet</p>;
  }

  const lastLog = logs[logs.length - 1];
  const isTerminal = TERMINAL_STATUSES.includes(
    lastLog.to_status as (typeof TERMINAL_STATUSES)[number],
  );

  const showTotalDuration = task?.started_at != null && task?.completed_at != null;
  const totalDurationMs = showTotalDuration
    ? new Date(task!.completed_at!).getTime() - new Date(task!.started_at!).getTime()
    : 0;

  return (
    <div>
      {showTotalDuration && totalDurationMs >= 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          Total duration:{' '}
          <span className="font-medium">{formatTransitionDuration(totalDurationMs)}</span>
        </p>
      )}

      <div className="relative">
        <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-4">
          {logs.map((log, index) => {
            const prevLog = index > 0 ? logs[index - 1] : null;
            const durationMs = prevLog
              ? new Date(log.created_at).getTime() - new Date(prevLog.created_at).getTime()
              : 0;
            const isLongDuration = durationMs > FIVE_MINUTES_MS;
            const isLastEntry = index === logs.length - 1;
            const isOngoing = isLastEntry && !isTerminal;

            return (
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
                        <span
                          className={cn('text-sm font-medium', statusTextColor(log.from_status))}
                        >
                          {log.from_status}
                        </span>
                        <span className="text-xs text-muted-foreground">→</span>
                        <span
                          className={cn('text-sm font-semibold', statusTextColor(log.to_status))}
                        >
                          {log.to_status}
                        </span>
                      </>
                    ) : (
                      <span className={cn('text-sm font-semibold', statusTextColor(log.to_status))}>
                        {log.to_status}
                      </span>
                    )}
                    {isLastEntry && (
                      <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        current
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{log.actor}</span>
                    <span>·</span>
                    <span>{formatRelativeTime(log.created_at)}</span>
                    {index > 0 && (
                      <>
                        <span>·</span>
                        <span className={cn(isLongDuration && 'text-amber-600 font-medium')}>
                          +{formatTransitionDuration(durationMs)}
                        </span>
                      </>
                    )}
                    {isOngoing && (
                      <>
                        <span>·</span>
                        <span className="text-blue-600">ongoing</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
