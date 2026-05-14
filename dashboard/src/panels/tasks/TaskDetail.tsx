import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { fireApprovalEvent } from '@/lib/gateway';
import type { Task, TaskStatusLog, PendingApproval } from '@/lib/types';
import { StatusBadge } from './StatusBadge';
import { StatusTimeline } from './StatusTimeline';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const RAW_EVENT_TRUNCATE_CHARS = 2000;

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-muted', className)} />;
}

function TaskDetailSkeleton() {
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

function RawEventViewer({ rawEvent }: { rawEvent: Record<string, unknown> | null }) {
  const [showFull, setShowFull] = useState(false);
  const [open, setOpen] = useState(false);

  if (rawEvent === null) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Raw Event
        </button>
        {open && <p className="mt-2 text-sm text-muted-foreground italic">No raw event data</p>}
      </div>
    );
  }

  const full = JSON.stringify(rawEvent, null, 2);
  const truncated = full.length > RAW_EVENT_TRUNCATE_CHARS;
  const displayed =
    !showFull && truncated ? full.slice(0, RAW_EVENT_TRUNCATE_CHARS) + '\n...' : full;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        Raw Event
      </button>
      {open && (
        <div className="mt-2">
          <pre className="overflow-x-auto rounded-md border bg-muted/50 p-4 text-xs leading-relaxed">
            {displayed}
          </pre>
          {truncated && (
            <button
              type="button"
              onClick={() => setShowFull((v) => !v)}
              className="mt-1 text-xs text-primary hover:underline"
            >
              {showFull ? 'Show less' : 'Show full'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenant();

  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!taskId) return null;
    const rows = await postgrestFetch<Task>('tasks', {
      id: `eq.${taskId}`,
      ...scopeByTenant(tenantId),
      select: '*,archetypes(role_name,model)',
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

  const { data: logs, loading: logsLoading } = usePoll(fetchLogs);

  const fetchApprovals = useCallback(async () => {
    if (!taskId || task?.status !== 'Reviewing') return [];
    return postgrestFetch<PendingApproval>('pending_approvals', {
      task_id: `eq.${taskId}`,
    });
  }, [taskId, task?.status]);

  const { data: pendingApprovals } = usePoll(fetchApprovals);

  const handleApprove = async () => {
    if (!taskId) return;
    setApproving(true);
    try {
      await fireApprovalEvent(taskId, 'approve');
      toast.success('Approval sent — status will update on next poll');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send approval');
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!taskId) return;
    setRejecting(true);
    try {
      await fireApprovalEvent(taskId, 'reject');
      toast.success('Rejection sent');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send rejection');
    } finally {
      setRejecting(false);
    }
  };

  if (taskLoading || logsLoading) {
    return <TaskDetailSkeleton />;
  }

  if (taskError) {
    return (
      <div className="p-6 space-y-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tasks
        </button>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm font-medium text-destructive">Error loading task</p>
          <p className="mt-1 text-xs text-muted-foreground">{taskError.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={refreshTask}>
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6 space-y-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tasks
        </button>
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <p className="text-sm font-medium">Task not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No task with ID <span className="font-mono">{taskId}</span>
          </p>
        </div>
      </div>
    );
  }

  const employeeName = task.archetypes?.role_name ?? 'Unknown Employee';
  const truncatedId = task.id.slice(0, 8) + '…';
  const isReviewing = task.status === 'Reviewing';
  const approvalsList = pendingApprovals ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tasks
      </button>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{employeeName}</h1>
            <p className="font-mono text-xs text-muted-foreground" title={task.id}>
              {truncatedId}
            </p>
          </div>
          <StatusBadge status={task.status} />
        </div>

        {task.status === 'Failed' && task.failure_reason && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-medium text-destructive">Failure reason</p>
              <p className="mt-0.5 text-sm text-destructive/80">{task.failure_reason}</p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-3">
        <h2 className="text-sm font-semibold">Status Timeline</h2>
        <StatusTimeline logs={logs ?? []} />
      </div>

      {isReviewing && (
        <div className="rounded-lg border bg-card p-6 space-y-4">
          <h2 className="text-sm font-semibold">Approval</h2>

          {approvalsList.length > 0 ? (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={approving || rejecting}
                onClick={() => void handleApprove()}
              >
                {approving ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Approve
              </Button>
              <Button
                variant="destructive"
                disabled={approving || rejecting}
                onClick={() => void handleReject()}
              >
                {rejecting ? <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                Reject
              </Button>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
              <p className="text-sm text-yellow-800">
                Approval card unavailable — this task may be a zombie (stuck in Reviewing with no
                pending approval)
              </p>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg border bg-card p-6">
        <RawEventViewer rawEvent={task.raw_event} />
      </div>
    </div>
  );
}
