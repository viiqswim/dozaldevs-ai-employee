import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Clock, MousePointer, Webhook } from 'lucide-react';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { TERMINAL_STATUSES } from '@/lib/constants';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { formatRelativeTime, formatDuration, cn } from '@/lib/utils';
import type { Task, TaskStatusLog } from '@/lib/types';
import { StatusBadge } from '@/panels/tasks/StatusBadge';
import { StatusTimeline } from '@/panels/tasks/StatusTimeline';

function TriggerSourceIcon({ sourceSystem }: { sourceSystem: string | null }) {
  if (sourceSystem === 'hostfully') return <Webhook className="h-3.5 w-3.5" />;
  if (sourceSystem === 'manual') return <MousePointer className="h-3.5 w-3.5" />;
  return <Clock className="h-3.5 w-3.5" />;
}

function triggerLabel(sourceSystem: string | null): string {
  if (sourceSystem === 'hostfully') return 'webhook';
  if (sourceSystem === 'manual') return 'manual';
  return 'scheduled';
}

export function ActivitySection({ archetypeId }: { archetypeId: string }) {
  const { tenantId } = useTenant();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [timelineLogs, setTimelineLogs] = useState<Record<string, TaskStatusLog[]>>({});
  const [timelineLoading, setTimelineLoading] = useState<Record<string, boolean>>({});

  const fetchTasks = useCallback(
    () =>
      postgrestFetch<Task>('tasks', {
        ...scopeByTenant(tenantId),
        archetype_id: `eq.${archetypeId}`,
        order: 'created_at.desc',
        limit: '5',
      }),
    [tenantId, archetypeId],
  );

  const { data: tasks, error, loading } = usePoll(fetchTasks);

  const isTerminal = (status: string) =>
    TERMINAL_STATUSES.includes(status as (typeof TERMINAL_STATUSES)[number]);

  const handleToggleExpand = async (taskId: string) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(taskId);
    if (timelineLogs[taskId] !== undefined) return;

    setTimelineLoading((prev) => ({ ...prev, [taskId]: true }));
    try {
      const logs = await postgrestFetch<TaskStatusLog>('task_status_log', {
        task_id: `eq.${taskId}`,
        order: 'created_at.asc',
        limit: '100',
      });
      setTimelineLogs((prev) => ({ ...prev, [taskId]: logs }));
    } catch {
      setTimelineLogs((prev) => ({ ...prev, [taskId]: [] }));
    } finally {
      setTimelineLoading((prev) => ({ ...prev, [taskId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg border bg-muted" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  if (!tasks || tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No activity yet. This employee hasn&apos;t run any tasks.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.map((task) => {
        const isExpanded = expandedTaskId === task.id;
        const logs = timelineLogs[task.id] ?? [];
        const loadingTimeline = timelineLoading[task.id] ?? false;

        return (
          <div
            key={task.id}
            className="rounded-lg border bg-card transition-shadow hover:shadow-sm"
          >
            <button
              type="button"
              className="w-full p-4 text-left"
              onClick={() => void handleToggleExpand(task.id)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={task.status} />
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <TriggerSourceIcon sourceSystem={task.source_system} />
                    <span>{triggerLabel(task.source_system)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatRelativeTime(task.created_at)}
                  </span>
                  {isTerminal(task.status) && (
                    <span className="text-xs text-muted-foreground">
                      · {formatDuration(task.created_at, task.updated_at)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Link
                    to={`/dashboard/tasks/${task.id}`}
                    className="text-xs text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View details →
                  </Link>
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      isExpanded && 'rotate-90',
                    )}
                  />
                </div>
              </div>
              {task.status === 'Failed' && task.failure_reason && (
                <p className="mt-2 text-xs text-destructive">{task.failure_reason}</p>
              )}
            </button>

            {isExpanded && (
              <div className="border-t px-4 pb-4 pt-3">
                {loadingTimeline ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-4 animate-pulse rounded bg-muted" />
                    ))}
                  </div>
                ) : (
                  <StatusTimeline logs={logs} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {tasks.length === 5 && (
        <div className="pt-1">
          <Link to="/dashboard/tasks" className="text-sm text-primary hover:underline">
            View all tasks →
          </Link>
        </div>
      )}
    </div>
  );
}
