import { useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { TERMINAL_STATUSES } from '@/lib/constants';
import { formatRelativeTime, formatDuration } from '@/lib/utils';
import type { Task } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </TableCell>
      ))}
    </TableRow>
  );
}

export function TaskFeed() {
  const { tenantId } = useTenant();
  const navigate = useNavigate();

  const fetchTasks = useCallback(
    () =>
      postgrestFetch<Task>('tasks', {
        ...scopeByTenant(tenantId),
        select: '*,archetypes(role_name,model)',
        order: 'created_at.desc',
        limit: '50',
      }),
    [tenantId],
  );

  const { data: tasks, error, loading, refresh } = usePoll(fetchTasks);

  if (loading) {
    return (
      <div className="p-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Failed to load tasks</p>
          <p className="mt-1 text-destructive/80">{error.message}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
            onClick={refresh}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-center">
        <p className="text-muted-foreground">No tasks found</p>
        <Link
          to="/dashboard/trigger"
          className="mt-2 text-sm text-primary underline-offset-4 hover:underline"
        >
          Trigger a task
        </Link>
      </div>
    );
  }

  const isTerminal = (status: string) =>
    TERMINAL_STATUSES.includes(status as (typeof TERMINAL_STATUSES)[number]);

  return (
    <div className="p-6">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow
              key={task.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => navigate(`/dashboard/tasks/${task.id}`)}
            >
              <TableCell>
                <StatusBadge status={task.status} />
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {task.archetypes?.role_name ?? task.archetype_id ?? '—'}
              </TableCell>
              <TableCell className="text-muted-foreground">{task.source_system ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatRelativeTime(task.created_at)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {isTerminal(task.status) ? formatDuration(task.created_at, task.updated_at) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
