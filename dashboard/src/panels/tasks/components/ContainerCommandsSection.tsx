import { Link } from 'react-router-dom';
import { Terminal } from 'lucide-react';
import { CommandRow } from './CommandRow';

interface ContainerCommandsSectionProps {
  taskId: string;
  tenantId: string;
}

export function ContainerCommandsSection({ taskId, tenantId }: ContainerCommandsSectionProps) {
  return (
    <div className="rounded-lg border bg-card px-5 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Container Commands</h2>
        <span className="text-xs text-muted-foreground">Local development only</span>
      </div>
      <div className="space-y-2">
        <CommandRow command={`docker logs -f employee-${taskId.slice(0, 8)}`} />
        <CommandRow command={`tail -f /tmp/employee-${taskId.slice(0, 8)}.log`} />
      </div>
      <Link
        to={`/dashboard/tasks/${taskId}/logs?tenant=${tenantId}`}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <Terminal className="h-3.5 w-3.5" />
        View Execution Logs
      </Link>
    </div>
  );
}
