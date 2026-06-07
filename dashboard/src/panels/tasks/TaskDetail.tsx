import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { useTenant } from '@/hooks/use-tenant';
import { triggerEmployee, fireApprovalEvent } from '@/lib/gateway';
import { formatRelativeTime, formatCostUsd } from '@/lib/utils';
import { StatusTimeline } from './StatusTimeline';
import { Button } from '@/components/ui/button';
import { useTaskData } from './hooks/useTaskData';
import { RawEventViewer } from './components/RawEventViewer';
import { CollapsibleJsonViewer } from './components/CollapsibleJsonViewer';
import { CompiledAgentsMdViewer } from './components/CompiledAgentsMdViewer';
import { ApprovalSection } from './components/ApprovalSection';
import { RerunDialog } from './components/RerunDialog';
import { ExecutionMetricsSection } from './components/ExecutionMetricsSection';
import { FeedbackEventsSection } from './components/FeedbackEventsSection';
import { TranscriptSection } from './components/TranscriptSection';
import { DeliverableSection } from './components/DeliverableSection';
import { TaskHeaderCard } from './components/TaskHeaderCard';
import { ContainerCommandsSection } from './components/ContainerCommandsSection';
import {
  TaskDetailSkeleton,
  formatDuration,
  isStringRecord,
  DELIVERABLE_STATUSES,
} from './components/task-detail-helpers';

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const { tenantId } = useTenant();
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const showTranscript = searchParams.has('transcript');

  const {
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
  } = useTaskData(taskId, tenantId, showTranscript);

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

  const handleRerun = async (inputs: Record<string, string>) => {
    const slug = task?.archetypes?.role_name;
    if (!slug) return;
    const result = await triggerEmployee(tenantId, slug, false, inputs);
    setRerunOpen(false);
    navigate(`/dashboard/tasks/${result.task_id}?tenant=${tenantId}`);
    toast.success('Task re-triggered — navigating to new task');
  };

  if (taskLoading || logsLoading) return <TaskDetailSkeleton />;

  const backBtn = (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to Tasks
    </button>
  );

  if (taskError)
    return (
      <div className="p-6 space-y-4">
        {backBtn}
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

  if (!task)
    return (
      <div className="p-6 space-y-4">
        {backBtn}
        <div className="rounded-lg border bg-muted/30 p-8 text-center">
          <p className="text-sm font-medium">Task not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No task with ID <span className="font-mono">{taskId}</span>
          </p>
        </div>
      </div>
    );

  const isAutoPass = execution === null && !executionLoading && task.status === 'Done';
  const execCostTotal =
    task?.executions
      ?.filter((e) => e.phase === 'execution')
      .reduce((s, e) => s + parseFloat(String(e.estimated_cost_usd ?? 0)), 0) ?? 0;
  const deliveryCostTotal =
    task?.executions
      ?.filter((e) => e.phase === 'delivery')
      .reduce((s, e) => s + parseFloat(String(e.estimated_cost_usd ?? 0)), 0) ?? 0;
  const totalCostAllPhases = execCostTotal + deliveryCostTotal;
  const totalTokens =
    execution && (execution.prompt_tokens ?? 0) + (execution.completion_tokens ?? 0) > 0
      ? ((execution.prompt_tokens ?? 0) + (execution.completion_tokens ?? 0)).toLocaleString()
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

      <TaskHeaderCard task={task} isTerminal={isTerminal} onRerun={() => setRerunOpen(true)} />

      <div className="rounded-lg border bg-card p-6">
        <RawEventViewer rawEvent={task.raw_event} />
      </div>

      <div className="rounded-lg border bg-card p-6 space-y-3">
        <h2 className="text-sm font-semibold">Status Timeline</h2>
        <StatusTimeline logs={logs ?? []} task={task} />
      </div>

      {task.status === 'Reviewing' && (
        <ApprovalSection
          approvalsList={pendingApprovals ?? []}
          approving={approving}
          rejecting={rejecting}
          onApprove={() => void handleApprove()}
          onReject={() => void handleReject()}
        />
      )}

      <ExecutionMetricsSection
        execution={execution}
        isAutoPass={isAutoPass}
        totalTokens={totalTokens}
        costDisplay={totalCostAllPhases > 0 ? formatCostUsd(totalCostAllPhases) : '—'}
        durationDisplay={formatDuration(task.started_at, task.completed_at)}
        heartbeatDisplay={
          execution?.heartbeat_at ? formatRelativeTime(execution.heartbeat_at) : '—'
        }
        execCostTotal={execCostTotal}
        deliveryCostTotal={deliveryCostTotal}
        totalCostAllPhases={totalCostAllPhases}
      />

      {execution && !isAutoPass && taskId && (
        <ContainerCommandsSection taskId={taskId} tenantId={tenantId} />
      )}

      {DELIVERABLE_STATUSES.has(task.status) && (
        <DeliverableSection deliverable={deliverable} isAutoPass={isAutoPass} />
      )}

      {task.triage_result && (
        <div className="rounded-lg border bg-card p-6 space-y-4" data-testid="triage-result">
          <h2 className="text-sm font-semibold">Triage Result</h2>
          <CollapsibleJsonViewer label="Triage Result" data={task.triage_result} />
        </div>
      )}

      {task.compiled_agents_md && <CompiledAgentsMdViewer content={task.compiled_agents_md} />}

      <FeedbackEventsSection feedbackEvents={feedbackEvents} feedbackError={feedbackError} />

      <TranscriptSection
        showTranscript={showTranscript}
        execution={execution}
        transcript={transcript}
        transcriptLoading={transcriptLoading}
        onShowTranscript={() => {
          const n = new URLSearchParams(searchParams);
          n.set('transcript', '1');
          setSearchParams(n, { replace: true });
        }}
        onHideTranscript={() => {
          const n = new URLSearchParams(searchParams);
          n.delete('transcript');
          setSearchParams(n, { replace: true });
        }}
      />

      <RerunDialog
        open={rerunOpen}
        onOpenChange={setRerunOpen}
        inputSchema={task.archetypes?.input_schema ?? []}
        initialInputs={isStringRecord(task?.raw_event?.inputs) ? task.raw_event.inputs : {}}
        onRerun={handleRerun}
      />
    </div>
  );
}
