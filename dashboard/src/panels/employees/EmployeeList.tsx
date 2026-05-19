import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { triggerEmployee, deleteArchetype } from '@/lib/gateway';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { GATEWAY_URL } from '@/lib/constants';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import type { Archetype } from '@/lib/types';
import { toast } from 'sonner';

// Fixed VLRE test fixtures — do not change
const WEBHOOK_FIXTURES = {
  agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
  thread_uid: '2f18249a-9523-4acd-a512-20ff06d5c3fa',
  lead_uid: '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb',
  property_uid: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
} as const;

function shortModel(model: string | null): string {
  if (!model) return '—';
  return model.split('/').pop() ?? model;
}

function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 7 }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </TableCell>
      ))}
    </TableRow>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  if (status === 'active') {
    return (
      <Badge
        variant="outline"
        className="border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
      >
        Active
      </Badge>
    );
  }
  if (status === 'draft') {
    return (
      <Badge
        variant="outline"
        className="border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
      >
        Draft
      </Badge>
    );
  }
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1) : '—';
  return (
    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
      {label}
    </Badge>
  );
}

export function EmployeeList() {
  const { tenantId } = useTenant();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'draft'>('all');
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const setRowLoading = (archetypeId: string, action: string, val: boolean) => {
    setLoadingStates((prev) => ({ ...prev, [`${archetypeId}-${action}`]: val }));
  };

  const isRowLoading = (archetypeId: string, action: string) =>
    loadingStates[`${archetypeId}-${action}`] ?? false;

  const fetchArchetypes = useCallback(
    () =>
      postgrestFetch<Archetype>('archetypes', {
        ...scopeByTenant(tenantId),
        status: 'neq.superseded',
        deleted_at: 'is.null',
        order: 'status.asc,role_name.asc',
        limit: '50',
      }),
    [tenantId],
  );

  const { data: archetypes, error, loading, refresh } = usePoll(fetchArchetypes);

  const handleTrigger = async (e: React.MouseEvent, archetype: Archetype) => {
    e.stopPropagation();
    if (!archetype.role_name) return;
    setRowLoading(archetype.id, 'trigger', true);
    try {
      const result = await triggerEmployee(tenantId, archetype.role_name, false);
      if (result.task_id) {
        toast.success('Task created', {
          description: result.task_id,
          action: {
            label: 'View',
            onClick: () => navigate(`/dashboard/tasks/${result.task_id}`),
          },
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRowLoading(archetype.id, 'trigger', false);
    }
  };

  const handleDryRun = async (e: React.MouseEvent, archetype: Archetype) => {
    e.stopPropagation();
    if (!archetype.role_name) return;
    setRowLoading(archetype.id, 'dryrun', true);
    try {
      await triggerEmployee(tenantId, archetype.role_name, true);
      toast.success('Dry run OK — would fire');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRowLoading(archetype.id, 'dryrun', false);
    }
  };

  const handleDelete = async (archetype: Archetype) => {
    if (!tenantId) return;
    setDeleteLoading(true);
    try {
      await deleteArchetype(tenantId, archetype.id);
      toast.success('Employee deleted');
      setDeletingId(null);
      refresh();
    } catch (err) {
      toast.error('Failed to delete employee');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleFireWebhook = async (e: React.MouseEvent, archetype: Archetype) => {
    e.stopPropagation();
    setRowLoading(archetype.id, 'webhook', true);
    const messageUid = `test-msg-${Date.now()}`;
    try {
      const response = await fetch(`${GATEWAY_URL}/webhooks/hostfully`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...WEBHOOK_FIXTURES,
          event_type: 'NEW_INBOX_MESSAGE',
          message_uid: messageUid,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Webhook error ${response.status}: ${text}`);
      }
      toast.success('Webhook fired — check Task Feed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRowLoading(archetype.id, 'webhook', false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Employees</h2>
          <Button onClick={() => navigate('/dashboard/employees/new')}>+ New Employee</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Runtime</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approval</TableHead>
              <TableHead>Concurrency</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, i) => (
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
          <p className="font-semibold">Failed to load employees</p>
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

  if (!archetypes || archetypes.length === 0) {
    return (
      <div className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Employees</h2>
          <Button onClick={() => navigate('/dashboard/employees/new')}>+ New Employee</Button>
        </div>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-lg font-medium mb-1">No employees yet</p>
          <p className="text-sm text-muted-foreground mb-4">
            Create your first AI employee to get started.
          </p>
          <Button onClick={() => navigate('/dashboard/employees/new')}>Create Employee</Button>
        </div>
      </div>
    );
  }

  const filteredArchetypes = archetypes.filter((a) => {
    const matchesSearch = a.role_name?.toLowerCase().includes(search.toLowerCase()) ?? true;
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Employees</h2>
        <Button onClick={() => navigate('/dashboard/employees/new')}>+ New Employee</Button>
      </div>
      <div className="flex items-center gap-3 mb-4">
        <Input
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1"
        />
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as 'all' | 'active' | 'draft')}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Model</TableHead>
            <TableHead>Runtime</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Approval</TableHead>
            <TableHead>Concurrency</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredArchetypes.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                No results match your search or filter.
              </TableCell>
            </TableRow>
          ) : (
            filteredArchetypes.map((archetype) => {
              const isGuestMessaging = archetype.role_name === 'guest-messaging';
              const isDraft = archetype.status === 'draft';
              return (
                <TableRow
                  key={archetype.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    navigate(
                      isDraft
                        ? `/dashboard/employees/${archetype.id}/edit`
                        : `/dashboard/employees/${archetype.id}`,
                    )
                  }
                >
                  <TableCell className="font-medium">
                    {archetype.role_name ?? (
                      <span className="text-muted-foreground">{archetype.id}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {shortModel(archetype.model)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {archetype.runtime ?? '—'}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={archetype.status ?? null} />
                  </TableCell>
                  <TableCell>
                    {archetype.risk_model?.approval_required ? (
                      <Badge
                        variant="outline"
                        className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      >
                        Required
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300"
                      >
                        Auto
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {archetype.concurrency_limit}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {!isDraft && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isRowLoading(archetype.id, 'trigger') || !archetype.role_name}
                            onClick={(e) => void handleTrigger(e, archetype)}
                          >
                            {isRowLoading(archetype.id, 'trigger') ? 'Triggering…' : 'Trigger'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isRowLoading(archetype.id, 'dryrun') || !archetype.role_name}
                            onClick={(e) => void handleDryRun(e, archetype)}
                          >
                            {isRowLoading(archetype.id, 'dryrun') ? 'Running…' : 'Dry Run'}
                          </Button>
                          {isGuestMessaging && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isRowLoading(archetype.id, 'webhook')}
                              onClick={(e) => void handleFireWebhook(e, archetype)}
                            >
                              {isRowLoading(archetype.id, 'webhook') ? 'Firing…' : 'Fire Webhook'}
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeletingId(archetype.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Dialog open={deletingId !== null} onOpenChange={(open) => !open && setDeletingId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {archetypes.find((a) => a.id === deletingId)?.role_name}?
            </DialogTitle>
            <DialogDescription>
              This employee will be soft-deleted. You can restore it later from the &ldquo;Show
              deleted&rdquo; view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteLoading}
              onClick={() => {
                const archetype = archetypes.find((a) => a.id === deletingId);
                if (archetype) void handleDelete(archetype);
              }}
            >
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
