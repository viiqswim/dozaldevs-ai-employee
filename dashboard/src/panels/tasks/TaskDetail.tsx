import { useCallback, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { fireApprovalEvent } from '@/lib/gateway';
import type { Task, TaskStatusLog, PendingApproval } from '@/lib/types';
import { useExecution } from '@/hooks/use-execution';
import { useDeliverable } from '@/hooks/use-deliverable';
import { useFeedbackEvents } from '@/hooks/use-feedback-events';
import { useExecutionTranscript } from '@/hooks/use-execution-transcript';
import { StatusBadge } from './StatusBadge';
import { StatusTimeline } from './StatusTimeline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const RAW_EVENT_TRUNCATE_CHARS = 2000;

const DELIVERABLE_STATUSES = new Set(['Submitting', 'Reviewing', 'Approved', 'Delivering', 'Done']);

const EVENT_TYPE_COLORS: Record<string, string> = {
  teaching: 'bg-blue-50 text-blue-700 border-blue-200',
  feedback: 'bg-violet-50 text-violet-700 border-violet-200',
  rejection_reason: 'bg-red-50 text-red-700 border-red-200',
  rejection: 'bg-red-50 text-red-700 border-red-200',
  edit_diff: 'bg-amber-50 text-amber-700 border-amber-200',
};

function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

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

function StatCard({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-center" data-testid={testId}>
      <p className="truncate text-lg font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  [key: string]: unknown;
}

function ToolCallBlock({ block }: { block: ContentBlock }) {
  const [open, setOpen] = useState(false);
  const name = typeof block.name === 'string' ? block.name : 'tool_call';

  return (
    <div className="mt-1.5 rounded border border-orange-200/70 bg-orange-50/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs font-medium text-orange-700"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        🔧 {name}
      </button>
      {open && block.input !== undefined && (
        <pre className="overflow-x-auto border-t border-orange-200/70 px-2 py-1.5 text-xs leading-relaxed">
          {JSON.stringify(block.input, null, 2)}
        </pre>
      )}
    </div>
  );
}

function TranscriptMessage({ message }: { message: unknown }) {
  const msg = message as Record<string, unknown>;
  const role = typeof msg.role === 'string' ? msg.role : 'unknown';
  const content = msg.content;
  const isUser = role === 'user';
  const isAssistant = role === 'assistant';

  const toolUses: ContentBlock[] = [];
  let textContent = '';

  if (typeof content === 'string') {
    textContent = content;
  } else if (Array.isArray(content)) {
    const texts: string[] = [];
    for (const block of content) {
      const b = block as ContentBlock;
      if (b.type === 'text' && typeof b.text === 'string') {
        texts.push(b.text);
      } else if (b.type === 'tool_use') {
        toolUses.push(b);
      } else if (b.type === 'tool_result') {
        const resultContent = b.content;
        const resultText =
          typeof resultContent === 'string'
            ? resultContent
            : JSON.stringify(resultContent, null, 2);
        texts.push(`[tool_result] ${resultText}`);
      } else {
        texts.push(JSON.stringify(b, null, 2));
      }
    }
    textContent = texts.join('\n');
  } else if (content !== undefined && content !== null) {
    textContent = JSON.stringify(content, null, 2);
  }

  if (!textContent && toolUses.length === 0) return null;

  return (
    <div
      className={cn(
        'rounded-md border p-3',
        isUser
          ? 'bg-muted/30'
          : isAssistant
            ? 'border-blue-200/50 bg-blue-50/30'
            : 'border-muted bg-muted/10',
      )}
    >
      <p
        className={cn(
          'mb-1.5 text-xs font-semibold uppercase tracking-wide',
          isUser ? 'text-muted-foreground' : isAssistant ? 'text-blue-600' : 'text-foreground/60',
        )}
      >
        {role}
      </p>
      {textContent && (
        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed">{textContent}</pre>
      )}
      {toolUses.map((tc, i) => (
        <ToolCallBlock key={i} block={tc} />
      ))}
    </div>
  );
}

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenant();

  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

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

  const { execution, loading: executionLoading } = useExecution(taskId ?? '');
  const { deliverable } = useDeliverable(taskId ?? '');
  const { events: feedbackEvents, error: feedbackError } = useFeedbackEvents(taskId ?? '');
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

  const costDisplay =
    execution && (execution.estimated_cost_usd ?? 0) > 0
      ? `$${(execution.estimated_cost_usd ?? 0).toFixed(4)}`
      : '—';

  const durationDisplay = formatDuration(task.started_at, task.completed_at);

  const heartbeatDisplay = execution?.heartbeat_at ? relativeTime(execution.heartbeat_at) : '—';

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
                <Badge variant="outline" className="text-xs font-medium">
                  {execution.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Status</p>
            </div>
            <StatCard label="Tokens" value={totalTokens} testId="execution-tokens" />
            <StatCard label="Cost" value={costDisplay} testId="execution-cost" />
            <StatCard label="Duration" value={durationDisplay} testId="execution-duration" />
            <StatCard label="Heartbeat" value={heartbeatDisplay} />
          </div>
        ) : isAutoPass ? (
          <div className="flex items-start gap-3 rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
            <span className="text-base leading-none">⚡</span>
            <p className="text-sm text-zinc-400">
              Auto-completed — no worker execution. This task was resolved during triage without
              spawning a worker.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">No execution data</p>
        )}
      </div>

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
                  {relativeTime(evt.created_at)}
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
              onClick={() => setShowTranscript(true)}
              disabled={!execution}
            >
              View Transcript
            </Button>
          )}
          {showTranscript && (
            <Button variant="ghost" size="sm" onClick={() => setShowTranscript(false)}>
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
                  <TranscriptMessage key={i} message={msg} />
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

      <div className="rounded-lg border bg-card p-6">
        <RawEventViewer rawEvent={task.raw_event} />
      </div>
    </div>
  );
}
