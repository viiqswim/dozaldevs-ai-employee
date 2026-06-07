import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Task } from '@/lib/types';
import { StatusBadge } from '../StatusBadge';

interface TaskHeaderCardProps {
  task: Task;
  isTerminal: boolean;
  onRerun: () => void;
}

export function TaskHeaderCard({ task, isTerminal, onRerun }: TaskHeaderCardProps) {
  return (
    <div className="rounded-lg border bg-card p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">
            {task.archetypes?.role_name ?? 'Unknown Employee'}
          </h1>
          <p className="font-mono text-xs text-muted-foreground" title={task.id}>
            {task.id.slice(0, 8)}…
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={task.status} />
          {isTerminal && task.source_system === 'manual' && (
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5"
              onClick={onRerun}
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
  );
}
