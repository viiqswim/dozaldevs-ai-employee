import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { postgrestFetch, scopeByTenant } from '@/lib/postgrest';
import { triggerEmployee, deleteArchetype, patchArchetype } from '@/lib/gateway';
import { GATEWAY_URL } from '@/lib/constants';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import type { Archetype } from '@/lib/types';
import { toast } from 'sonner';
import { EmployeeProfileLayout } from './EmployeeProfileLayout';
import type { ProfileMode } from '@/lib/profile-constants';

const WEBHOOK_FIXTURES = {
  agency_uid: '942d08d9-82bb-4fd3-9091-ca0c6b50b578',
  thread_uid: '2f18249a-9523-4acd-a512-20ff06d5c3fa',
  lead_uid: '37f5f58f-d308-42bf-8ed3-f0c2d70f16fb',
  property_uid: 'c960c8d2-9a51-49d8-bb48-355a7bfbe7e2',
} as const;

const TAB_TO_SECTION: Record<string, string> = {
  settings: 'section-assignment',
  config: 'section-assignment',
  activity: 'section-activity',
  tasks: 'section-activity',
  training: 'section-training',
  rules: 'section-training',
  knowledge: 'section-preview',
  brain: 'section-preview',
};

export function EmployeeDetail() {
  const { archetypeId } = useParams<{ archetypeId: string }>();
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [triggering, setTriggering] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [firingWebhook, setFiringWebhook] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchArchetype = useCallback(
    () =>
      postgrestFetch<Archetype>('archetypes', {
        id: `eq.${archetypeId ?? ''}`,
        ...scopeByTenant(tenantId),
        deleted_at: 'is.null',
      }).then((arr) => arr[0] ?? null),
    [archetypeId, tenantId],
  );

  const { data: archetype, error, loading, refresh } = usePoll<Archetype | null>(fetchArchetype);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (!tab || !archetype) return;
    const sectionId = TAB_TO_SECTION[tab];
    if (!sectionId) return;
    setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
  }, [archetype, searchParams]);

  const handleTrigger = async () => {
    if (!archetype?.role_name) return;
    setTriggering(true);
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
      setTriggering(false);
    }
  };

  const handleDryRun = async () => {
    if (!archetype?.role_name) return;
    setDryRunning(true);
    try {
      await triggerEmployee(tenantId, archetype.role_name, true);
      toast.success('Dry run OK — would fire');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDryRunning(false);
    }
  };

  const handleDelete = async () => {
    if (!archetype || !tenantId) return;
    setDeleteLoading(true);
    try {
      await deleteArchetype(tenantId, archetype.id);
      toast.success('Employee deleted');
      setDeleteDialogOpen(false);
      navigate('/dashboard/employees?tenant=' + tenantId);
    } catch {
      toast.error('Failed to delete employee');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleFireWebhook = async () => {
    setFiringWebhook(true);
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
      setFiringWebhook(false);
    }
  };

  const handleFinalize = async () => {
    if (!archetype) return;
    if (
      !archetype.role_name?.trim() ||
      !archetype.instructions?.trim() ||
      !archetype.agents_md?.trim()
    ) {
      toast.error('Role name, trigger prompt, and employee brain are required');
      return;
    }
    setFinalizing(true);
    try {
      await patchArchetype(tenantId, archetype.id, { status: 'active' });
      toast.success('Employee created');
      navigate('/dashboard/employees');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409') || msg.includes('ROLE_NAME_TAKEN')) {
        toast.error(
          'This name is already taken by an active employee. Change the role name first.',
        );
      } else {
        toast.error(msg);
      }
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            <div className="h-6 w-52 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="h-8 w-20 animate-pulse rounded bg-muted" />
            <div className="h-8 w-20 animate-pulse rounded bg-muted" />
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-28 animate-pulse rounded-lg border bg-muted" />
          <div className="h-px bg-border" />
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="grid grid-cols-2 gap-4">
              <div className="h-12 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded bg-muted" />
              <div className="h-12 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="h-48 animate-pulse rounded-lg border bg-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Failed to load employee</p>
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

  if (!archetype) {
    return (
      <div className="flex items-center justify-center p-16 text-center">
        <p className="text-muted-foreground">Employee not found</p>
      </div>
    );
  }

  const showWebhookButton = archetype.deliverable_type === 'hostfully_message';
  const mode: ProfileMode = archetype.status === 'draft' ? 'edit' : 'view';

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            to="/dashboard/employees"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Employees
          </Link>
          <h1 className="text-xl font-semibold">{archetype.role_name ?? archetype.id}</h1>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={triggering || !archetype.role_name}
            onClick={() => {
              const hasEveryRunInputs = (archetype.input_schema ?? []).some(
                (item) => item.frequency === 'every_run',
              );
              if (hasEveryRunInputs) {
                navigate(`/dashboard/employees/${archetype.id}/trigger?tenant=${tenantId}`);
              } else {
                void handleTrigger();
              }
            }}
          >
            {triggering ? 'Triggering…' : 'Trigger'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={dryRunning || !archetype.role_name}
            onClick={() => void handleDryRun()}
          >
            {dryRunning ? 'Running…' : 'Dry Run'}
          </Button>
          {showWebhookButton && (
            <Button
              size="sm"
              variant="secondary"
              disabled={firingWebhook}
              onClick={() => void handleFireWebhook()}
            >
              {firingWebhook ? 'Firing…' : 'Fire Webhook'}
            </Button>
          )}
          {archetype.status === 'draft' && (
            <Button
              size="sm"
              disabled={
                finalizing ||
                !archetype.role_name?.trim() ||
                !archetype.instructions?.trim() ||
                !archetype.agents_md?.trim() ||
                !archetype.notification_channel?.trim()
              }
              onClick={() => void handleFinalize()}
            >
              {finalizing ? 'Creating…' : 'Create Employee'}
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            Delete
          </Button>
        </div>
      </div>

      <EmployeeProfileLayout
        archetype={archetype}
        mode={mode}
        tenantId={tenantId}
        onSaved={refresh}
        showActivity={true}
        showTraining={true}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {archetype.role_name}?</DialogTitle>
            <DialogDescription>
              This employee will be soft-deleted. You can restore it later from the &ldquo;Show
              deleted&rdquo; view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteLoading}
              onClick={() => void handleDelete()}
            >
              {deleteLoading ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
