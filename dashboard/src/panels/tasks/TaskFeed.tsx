import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { StatCard } from '@/components/ui/stat-card';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { TERMINAL_STATUSES } from '@/lib/constants';
import { formatRelativeTime, formatDuration, formatWorkMinutes, formatCostUsd } from '@/lib/utils';
import type { Task } from '@/lib/types';
import { StatusBadge } from './StatusBadge';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'Received', label: 'Received' },
  { value: 'Triaging', label: 'Triaging' },
  { value: 'AwaitingInput', label: 'AwaitingInput' },
  { value: 'Ready', label: 'Ready' },
  { value: 'Executing', label: 'Executing' },
  { value: 'Validating', label: 'Validating' },
  { value: 'Submitting', label: 'Submitting' },
  { value: 'Reviewing', label: 'Reviewing' },
  { value: 'Approved', label: 'Approved' },
  { value: 'Delivering', label: 'Delivering' },
  { value: 'Done', label: 'Done' },
  { value: 'Failed', label: 'Failed' },
  { value: 'Cancelled', label: 'Cancelled' },
];

function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 6 }).map((_, i) => (
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
  const [searchParams, setSearchParams] = useSearchParams();

  const statusFilter = searchParams.get('status') ?? '';
  const employeeFilter = searchParams.get('employee') ?? '';
  const dateFrom = searchParams.get('from') ?? '';
  const dateTo = searchParams.get('to') ?? '';
  const [archetypes, setArchetypes] = useState<{ id: string; role_name: string | null }[]>([]);

  const { defaultDateFrom, defaultDateTo } = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - 30);
    return {
      defaultDateFrom: from.toISOString().slice(0, 10),
      defaultDateTo: new Date().toISOString().slice(0, 10),
    };
  }, []);

  const effectiveDateFrom = dateFrom || defaultDateFrom;
  const effectiveDateTo = dateTo || defaultDateTo;

  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const hasFrom = searchParams.has('from');
    const hasTo = searchParams.has('to');
    if (!hasFrom || !hasTo) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!hasFrom) next.set('from', defaultDateFrom);
          if (!hasTo) next.set('to', defaultDateTo);
          return next;
        },
        { replace: true },
      );
    }
  }, [searchParams, setSearchParams, defaultDateFrom, defaultDateTo]);

  const setStatusFilter = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('status', value);
    else next.delete('status');
    setSearchParams(next, { replace: true });
  };
  const setEmployeeFilter = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('employee', value);
    else next.delete('employee');
    setSearchParams(next, { replace: true });
  };
  const setDateFrom = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('from', value);
    else next.delete('from');
    setSearchParams(next, { replace: true });
  };
  const setDateTo = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('to', value);
    else next.delete('to');
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    postgrestFetch<{ id: string; role_name: string | null }>('archetypes', {
      select: 'id,role_name',
      ...scopeByTenant(tenantId),
      deleted_at: 'is.null',
    })
      .then(setArchetypes)
      .catch(() => {});
  }, [tenantId]);

  const fetchTasks = useCallback(() => {
    const params: Record<string, string> = {
      ...scopeByTenant(tenantId),
      select: '*,archetypes(role_name,model),executions(estimated_cost_usd)',
      order: 'created_at.desc',
      created_at: `gte.${effectiveDateFrom}T00:00:00`,
      limit: 'none',
    };
    if (statusFilter) params.status = `eq.${statusFilter}`;
    if (employeeFilter) params.archetype_id = `eq.${employeeFilter}`;
    return postgrestFetch<Task>('tasks', params);
  }, [tenantId, statusFilter, employeeFilter, effectiveDateFrom]);

  const { data: rawTasks, error, loading, refresh } = usePoll(fetchTasks);
  const fetchTenantMetrics = useCallback(() => {
    const params: Record<string, string> = {
      ...scopeByTenant(tenantId),
      select: 'work_minutes,created_at',
      limit: 'none',
    };
    if (employeeFilter) params.archetype_id = `eq.${employeeFilter}`;
    if (effectiveDateFrom) params.created_at = `gte.${effectiveDateFrom}T00:00:00`;
    return postgrestFetch<{ work_minutes: number; created_at: string }>('task_metrics', params);
  }, [tenantId, employeeFilter, effectiveDateFrom, effectiveDateTo]);
  const { data: tenantMetrics } = usePoll(fetchTenantMetrics);

  const fetchTenantCosts = useCallback(() => {
    const params: Record<string, string> = {
      ...scopeByTenant(tenantId),
      select: 'created_at,executions(estimated_cost_usd)',
      limit: 'none',
    };
    if (employeeFilter) params.archetype_id = `eq.${employeeFilter}`;
    if (effectiveDateFrom) params.created_at = `gte.${effectiveDateFrom}T00:00:00`;
    return postgrestFetch<{
      created_at: string;
      executions: { estimated_cost_usd: number | null }[];
    }>('tasks', params);
  }, [tenantId, employeeFilter, effectiveDateFrom, effectiveDateTo]);
  const { data: tenantCosts } = usePoll(fetchTenantCosts);

  const filteredMetrics = tenantMetrics?.filter(
    (m) => m.created_at.slice(0, 10) <= effectiveDateTo,
  );
  const totalWorkMinutes = filteredMetrics?.reduce((sum, m) => sum + m.work_minutes, 0) ?? 0;
  const tasksCompleted = filteredMetrics?.length ?? 0;

  const filteredCosts = tenantCosts?.filter((t) => t.created_at.slice(0, 10) <= effectiveDateTo);
  const totalCostUsd =
    filteredCosts?.reduce((sum, t) => sum + (t.executions?.[0]?.estimated_cost_usd ?? 0), 0) ?? 0;
  const costPerWorkHour =
    totalWorkMinutes > 0 && totalCostUsd > 0 ? totalCostUsd / (totalWorkMinutes / 60) : 0;

  const tasks = rawTasks?.filter((task) => task.created_at.slice(0, 10) <= effectiveDateTo);

  const employeeOptions = [
    { value: '', label: 'All Employees' },
    ...archetypes.map((a) => ({ value: a.id, label: a.role_name ?? a.id })),
  ];

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
              <TableHead>Cost</TableHead>
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

  const isTerminal = (status: string) =>
    TERMINAL_STATUSES.includes(status as (typeof TERMINAL_STATUSES)[number]);

  return (
    <div className="p-6">
      <div className="mb-4 flex gap-4">
        <StatCard
          label="Hours of Work Done"
          value={formatWorkMinutes(totalWorkMinutes)}
          className="flex-1"
        />
        <StatCard label="Tasks Completed" value={String(tasksCompleted)} className="flex-1" />
        <StatCard
          label="Total Employee Cost"
          value={formatCostUsd(totalCostUsd)}
          className="flex-1"
        />
        <StatCard
          label="Employee Hourly Rate"
          value={formatCostUsd(costPerWorkHour)}
          className="flex-1"
        />
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Status</label>
          <SearchableSelect
            options={STATUS_OPTIONS}
            value={statusFilter}
            onValueChange={setStatusFilter}
            placeholder="All Statuses"
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Employee</label>
          <SearchableSelect
            options={employeeOptions}
            value={employeeFilter}
            onValueChange={setEmployeeFilter}
            placeholder="All Employees"
            className="w-52"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={effectiveDateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={effectiveDateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      <p className="mb-3 text-sm text-muted-foreground">Showing {tasks?.length ?? 0} tasks</p>

      {!tasks || tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">No tasks found</p>
          <Link
            to="/dashboard/trigger"
            className="mt-2 text-sm text-primary underline-offset-4 hover:underline"
          >
            Trigger a task
          </Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Status</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Cost</TableHead>
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
                <TableCell className="text-muted-foreground">
                  {(() => {
                    const cost = task.executions?.[0]?.estimated_cost_usd;
                    return cost != null && cost > 0 ? `$${cost.toFixed(4)}` : '—';
                  })()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
