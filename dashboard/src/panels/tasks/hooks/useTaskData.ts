import { useCallback } from 'react';
import { usePoll } from '@/hooks/use-poll';
import { gatewayFetch } from '@/lib/gateway';
import type { Task, TaskStatusLog, PendingApproval } from '@/lib/types';
import { TERMINAL_STATUSES, POLL_INTERVAL_MS } from '@/lib/constants';
import { useExecution } from '@/hooks/use-execution';
import { useDeliverable } from '@/hooks/use-deliverable';
import { useFeedbackEvents } from '@/hooks/use-feedback-events';
import { useExecutionTranscript } from '@/hooks/use-execution-transcript';

export function useTaskData(taskId: string | undefined, tenantId: string, showTranscript: boolean) {
  const fetchTask = useCallback(async () => {
    if (!taskId) return null;
    return gatewayFetch<Task>(`/admin/tenants/${tenantId}/tasks/${taskId}`);
  }, [taskId, tenantId]);

  const fetchLogs = useCallback(async () => {
    if (!taskId) return [];
    return gatewayFetch<TaskStatusLog[]>(
      `/admin/tenants/${tenantId}/tasks/${taskId}/status-log?limit=100`,
    );
  }, [taskId, tenantId]);

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
    return gatewayFetch<PendingApproval[]>(
      `/admin/tenants/${tenantId}/tasks/${taskId}/pending-approval`,
    );
  }, [taskId, task?.status, tenantId]);

  const { data: pendingApprovals } = usePoll(fetchApprovals, POLL_INTERVAL_MS, !isTerminal);

  const { execution, loading: executionLoading } = useExecution(
    taskId ?? '',
    tenantId,
    !isTerminal,
  );
  const { deliverable } = useDeliverable(taskId ?? '', tenantId, !isTerminal);
  const { events: feedbackEvents, error: feedbackError } = useFeedbackEvents(
    taskId ?? '',
    tenantId,
    !isTerminal,
  );
  const { transcript, loading: transcriptLoading } = useExecutionTranscript(
    showTranscript ? (execution?.id ?? null) : null,
    tenantId,
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
