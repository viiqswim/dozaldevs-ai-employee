import { useCallback, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Copy,
  Check,
  Terminal,
} from 'lucide-react';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { fireApprovalEvent, triggerEmployee } from '@/lib/gateway';
import type { Task, TaskStatusLog, PendingApproval, InputSchemaItem } from '@/lib/types';
import { TERMINAL_STATUSES, POLL_INTERVAL_MS } from '@/lib/constants';
import { useExecution } from '@/hooks/use-execution';
import { useDeliverable } from '@/hooks/use-deliverable';
import { useFeedbackEvents } from '@/hooks/use-feedback-events';
import { useExecutionTranscript } from '@/hooks/use-execution-transcript';
import { StatusBadge } from './StatusBadge';
import { StatusTimeline } from './StatusTimeline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, formatCostUsd, formatRelativeTime } from '@/lib/utils';
import { StatCard } from '@/components/ui/stat-card';

const RAW_EVENT_TRUNCATE_CHARS = 2000;

const EXECUTION_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  running: 'bg-blue-100 text-blue-800',
  failed: 'bg-red-100 text-red-800',
  pending: 'bg-slate-100 text-slate-700',
};

const DELIVERABLE_STATUSES = new Set(['Submitting', 'Reviewing', 'Approved', 'Delivering', 'Done']);

const EVENT_TYPE_COLORS: Record<string, string> = {
  teaching: 'bg-blue-50 text-blue-700 border-blue-200',
  feedback: 'bg-violet-50 text-violet-700 border-violet-200',
  rejection_reason: 'bg-red-50 text-red-700 border-red-200',
  rejection: 'bg-red-50 text-red-700 border-red-200',
  edit_diff: 'bg-amber-50 text-amber-700 border-amber-200',
};

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—';
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

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
          Task Input
        </button>
        {open && (
          <p className="mt-2 text-sm text-muted-foreground italic">
            This task was not triggered by a webhook, so no payload was captured.
          </p>
        )}
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
        Task Input
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

function CollapsibleJsonViewer({
  label,
  data,
  defaultOpen = false,
}: {
  label: string;
  data: Record<string, unknown>;
  defaultOpen?: boolean;
}) {
  const [showFull, setShowFull] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  const full = JSON.stringify(data, null, 2);
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
        {label}
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

function CompiledAgentsMdViewer({ content }: { content: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-semibold text-foreground">Compiled AGENTS.md</span>
        <span className="ml-1 text-xs text-muted-foreground font-normal">(debug)</span>
      </button>
      {open && (
        <pre className="max-h-[32rem] overflow-auto rounded-md border bg-muted/50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
          {content}
        </pre>
      )}
    </div>
  );
}

function CommandRow({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded bg-muted px-3 py-1.5 font-mono text-xs text-muted-foreground">
        {command}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
        title="Copy to clipboard"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}

const inputCls =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

function FormField({
  item,
  value,
  onChange,
}: {
  item: InputSchemaItem;
  value: string;
  onChange: (val: string) => void;
}) {
  const placeholder = item.description ?? `Enter ${item.label}`;

  let fieldEl: React.ReactNode;

  if (item.type === 'long_text') {
    fieldEl = (
      <textarea
        className={`${inputCls} min-h-[80px] resize-y`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  } else if (item.type === 'select' && item.options && item.options.length > 0) {
    fieldEl = (
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {item.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  } else {
    const typeMap: Record<InputSchemaItem['type'], string> = {
      text: 'text',
      long_text: 'text',
      date: 'date',
      number: 'number',
      url: 'url',
      select: 'text',
    };
    fieldEl = (
      <input
        className={inputCls}
        type={typeMap[item.type]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {item.label}
        {item.required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
      {fieldEl}
    </div>
  );
}

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenant();

  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [rerunInputs, setRerunInputs] = useState<Record<string, string>>({});
  const [rerunSubmitting, setRerunSubmitting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const showTranscript = searchParams.has('transcript');

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

  const openRerun = () => {
    const existingInputs = task?.raw_event?.inputs as Record<string, string> | undefined;
    setRerunInputs(existingInputs ?? {});
    setRerunOpen(true);
  };

  const handleRerun = async () => {
    const slug = task?.archetypes?.role_name;
    if (!slug) return;
    setRerunSubmitting(true);
    try {
      const result = await triggerEmployee(tenantId, slug, false, rerunInputs);
      setRerunOpen(false);
      navigate(`/dashboard/tasks/${result.task_id}?tenant=${tenantId}`);
      toast.success('Task re-triggered — navigating to new task');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to re-trigger task');
    } finally {
      setRerunSubmitting(false);
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
  const showDeliverable = DELIVERABLE_STATUSES.has(task.status);
  const isAutoPass = execution === null && !executionLoading && task.status === 'Done';

  const totalTokens =
    execution && (execution.prompt_tokens ?? 0) + (execution.completion_tokens ?? 0) > 0
      ? ((execution.prompt_tokens ?? 0) + (execution.completion_tokens ?? 0)).toLocaleString()
      : '—';

  const execCostTotal =
    task?.executions
      ?.filter((e) => e.phase === 'execution')
      .reduce((s, e) => s + parseFloat(String(e.estimated_cost_usd ?? 0)), 0) ?? 0;
  const deliveryCostTotal =
    task?.executions
      ?.filter((e) => e.phase === 'delivery')
      .reduce((s, e) => s + parseFloat(String(e.estimated_cost_usd ?? 0)), 0) ?? 0;
  const totalCostAllPhases = execCostTotal + deliveryCostTotal;

  const costDisplay = totalCostAllPhases > 0 ? formatCostUsd(totalCostAllPhases) : '—';

  const durationDisplay = formatDuration(task.started_at, task.completed_at);

  const heartbeatDisplay = execution?.heartbeat_at
    ? formatRelativeTime(execution.heartbeat_at)
    : '—';

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
          <div className="flex items-center gap-2">
            <StatusBadge status={task.status} />
            {isTerminal && task.source_system === 'manual' && (
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5"
                onClick={openRerun}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-run
              </Button>
            )}
          </div>
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

      <div className="rounded-lg border bg-card p-6">
        <RawEventViewer rawEvent={task.raw_event} />
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-3">
        <h2 className="text-sm font-semibold">Status Timeline</h2>
        <StatusTimeline logs={logs ?? []} task={task} />
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

      {execution && !isAutoPass && (
        <div className="rounded-lg border bg-card px-5 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Container Commands</h2>
            <span className="text-xs text-muted-foreground">Local development only</span>
          </div>
          <div className="space-y-2">
            <CommandRow command={`docker logs -f employee-${taskId?.slice(0, 8)}`} />
            <CommandRow command={`tail -f /tmp/employee-${taskId?.slice(0, 8)}.log`} />
          </div>
          <Link
            to={`/dashboard/tasks/${taskId}/logs?tenant=${tenantId}`}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Terminal className="h-3.5 w-3.5" />
            View Execution Logs
          </Link>
        </div>
      )}

      {showDeliverable && (
        <div className="rounded-lg border bg-card p-6 space-y-4" data-testid="deliverable-content">
          <h2 className="text-sm font-semibold">Deliverable</h2>
          {deliverable ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {deliverable.delivery_type && (
                  <Badge variant="outline" className="text-xs font-medium">
                    {deliverable.delivery_type}
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs font-medium text-muted-foreground">
                  {deliverable.status}
                </Badge>
              </div>
              {deliverable.content ? (
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Content</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md border bg-muted/50 p-4 text-xs leading-relaxed">
                    {(() => {
                      try {
                        return JSON.stringify(JSON.parse(deliverable.content ?? ''), null, 2);
                      } catch {
                        return deliverable.content;
                      }
                    })()}
                  </pre>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">No content</p>
              )}
              {deliverable.metadata && (
                <CollapsibleJsonViewer label="Metadata" data={deliverable.metadata} />
              )}
            </div>
          ) : isAutoPass ? (
            <p className="text-sm text-muted-foreground italic">
              No deliverable — task auto-completed during triage
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">No deliverable yet</p>
          )}
        </div>
      )}

      {task.triage_result && (
        <div className="rounded-lg border bg-card p-6 space-y-4" data-testid="triage-result">
          <h2 className="text-sm font-semibold">Triage Result</h2>
          <CollapsibleJsonViewer label="Triage Result" data={task.triage_result} />
        </div>
      )}

      {task.compiled_agents_md && <CompiledAgentsMdViewer content={task.compiled_agents_md} />}

      <div
        className="rounded-lg border bg-card p-6 space-y-4"
        data-testid="feedback-events-section"
      >
        <h2 className="text-sm font-semibold">Feedback Events</h2>
        {feedbackError ? (
          <p className="text-sm text-red-400">Unable to load feedback events</p>
        ) : feedbackEvents.length > 0 ? (
          <ul className="space-y-2">
            {feedbackEvents.map((evt) => (
              <li
                key={evt.id}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm"
              >
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 text-xs font-medium',
                    EVENT_TYPE_COLORS[evt.event_type] ?? '',
                  )}
                >
                  {evt.event_type}
                </Badge>
                {evt.actor_id && (
                  <span className="font-mono text-xs text-muted-foreground">{evt.actor_id}</span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {formatRelativeTime(evt.created_at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground italic">No feedback events</p>
        )}
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Session Transcript</h2>
          {!showTranscript && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.set('transcript', '1');
                setSearchParams(next, { replace: true });
              }}
              disabled={!execution}
            >
              View Transcript
            </Button>
          )}
          {showTranscript && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete('transcript');
                setSearchParams(next, { replace: true });
              }}
            >
              Hide
            </Button>
          )}
        </div>

        {showTranscript && (
          <>
            {transcriptLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Loading transcript…
              </div>
            )}
            {!transcriptLoading && transcript === null && (
              <p className="text-sm text-muted-foreground italic">Transcript not available</p>
            )}
            {!transcriptLoading && transcript !== null && transcript.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Transcript is empty</p>
            )}
            {!transcriptLoading && transcript !== null && transcript.length > 0 && (
              <div className="space-y-2">
                {transcript.map((msg, i) => (
                  <CollapsibleJsonViewer
                    key={i}
                    label={`Message ${i + 1}`}
                    data={msg as Record<string, unknown>}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {!showTranscript && !execution && (
          <p className="text-xs text-muted-foreground italic">
            No execution record — transcript unavailable
          </p>
        )}
      </div>

      {rerunOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative mx-4 w-full max-w-lg rounded-lg border bg-card p-6 space-y-4 shadow-lg">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-base font-semibold">Re-run Task</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Edit inputs below, then click Re-run to start a new task.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRerunOpen(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {(task.archetypes?.input_schema ?? []).filter((f) => f.frequency === 'every_run')
                .length > 0 ? (
                (task.archetypes?.input_schema ?? [])
                  .filter((f) => f.frequency === 'every_run')
                  .map((item) => (
                    <FormField
                      key={item.key}
                      item={item}
                      value={rerunInputs[item.key] ?? ''}
                      onChange={(val) => setRerunInputs((prev) => ({ ...prev, [item.key]: val }))}
                    />
                  ))
              ) : (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Prompt</label>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-y placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={rerunInputs['prompt'] ?? ''}
                    onChange={(e) =>
                      setRerunInputs((prev) => ({ ...prev, prompt: e.target.value }))
                    }
                    placeholder="Enter instructions for this employee..."
                  />
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setRerunOpen(false)}
                disabled={rerunSubmitting}
              >
                Cancel
              </Button>
              <Button onClick={() => void handleRerun()} disabled={rerunSubmitting}>
                {rerunSubmitting ? 'Running...' : 'Re-run'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
