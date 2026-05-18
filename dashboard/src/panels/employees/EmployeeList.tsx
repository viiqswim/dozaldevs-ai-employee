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
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { triggerEmployee } from '@/lib/gateway';
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
      {Array.from({ length: 6 }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </TableCell>
      ))}
    </TableRow>
  );
}

export function EmployeeList() {
  const { tenantId } = useTenant();
  const navigate = useNavigate();

  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

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
            <TableHead>Approval</TableHead>
            <TableHead>Concurrency</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {archetypes.map((archetype) => {
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
                  <div className="flex items-center gap-2">
                    {archetype.role_name ?? (
                      <span className="text-muted-foreground">{archetype.id}</span>
                    )}
                    {isDraft && (
                      <Badge
                        variant="outline"
                        className="border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
                      >
                        Draft
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {shortModel(archetype.model)}
                </TableCell>
                <TableCell className="text-muted-foreground">{archetype.runtime ?? '—'}</TableCell>
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
                  {!isDraft && (
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
