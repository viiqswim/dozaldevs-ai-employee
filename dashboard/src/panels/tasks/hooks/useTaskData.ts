import { useCallback } from 'react';
import { usePoll } from '@/hooks/use-poll';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import type { Task, TaskStatusLog, PendingApproval } from '@/lib/types';
import { TERMINAL_STATUSES, POLL_INTERVAL_MS } from '@/lib/constants';
import { useExecution } from '@/hooks/use-execution';
import { useDeliverable } from '@/hooks/use-deliverable';
import { useFeedbackEvents } from '@/hooks/use-feedback-events';
import { useExecutionTranscript } from '@/hooks/use-execution-transcript';

export function useTaskData(taskId: string | undefined, tenantId: string, showTranscript: boolean) {
  const fetchTask = useCallback(async () => {
    if (!taskId) return null;
    const rows = await postgrestFetch<Task>('tasks', {
      id: `eq.${taskId}`,
      ...scopeByTenant(tenantId),
      select: '*,archetypes(role_name,model,input_schema),executions(estimated_cost_usd,phase)',
    });
    return rows[0] ?? null;
  }, [taskId, tenantId]);

  const fetchLogs = useCallback(async () => {
    if (!taskId) return [];
    return postgrestFetch<TaskStatusLog>('task_status_log', {
      task_id: `eq.${taskId}`,
      order: 'created_at.asc',
      limit: '100',
    });
  }, [taskId]);

  const {
    data: task,
    error: taskError,
    loading: taskLoading,
    refresh: refreshTask,
  } = usePoll(fetchTask);

  const isTerminal = task
    ? TERMINAL_STATUSES.includes(task.status as (typeof TERMINAL_STATUSES)[number])
    : false;

  const { data: logs, loading: logsLoading } = usePoll(fetchLogs, POLL_INTERVAL_MS, !isTerminal);

  const fetchApprovals = useCallback(async () => {
    if (!taskId || task?.status !== 'Reviewing') return [];
    return postgrestFetch<PendingApproval>('pending_approvals', {
      task_id: `eq.${taskId}`,
    });
  }, [taskId, task?.status]);

  const { data: pendingApprovals } = usePoll(fetchApprovals, POLL_INTERVAL_MS, !isTerminal);

  const { execution, loading: executionLoading } = useExecution(taskId ?? '', !isTerminal);
  const { deliverable } = useDeliverable(taskId ?? '', !isTerminal);
  const { events: feedbackEvents, error: feedbackError } = useFeedbackEvents(
    taskId ?? '',
    !isTerminal,
  );
  const { transcript, loading: transcriptLoading } = useExecutionTranscript(
    showTranscript ? (execution?.id ?? null) : null,
  );

  return {
    task,
    taskError,
    taskLoading,
    refreshTask,
    logs,
    logsLoading,
    pendingApprovals,
    execution,
    executionLoading,
    deliverable,
    feedbackEvents,
    feedbackError,
    transcript,
    transcriptLoading,
    isTerminal,
  };
}
