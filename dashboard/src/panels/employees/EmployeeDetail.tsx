import { useCallback, useState } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { gatewayFetch, triggerEmployee, deleteArchetype, patchArchetype } from '@/lib/gateway';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import type { Archetype, Tenant } from '@/lib/types';
import { toast } from 'sonner';
import { EmployeeProfileLayout } from './EmployeeProfileLayout';
import { TrainingTab } from './TrainingTab';
import type { ProfileMode } from '@/lib/profile-constants';
import { DebugTab } from './DebugTab';
import { EmployeeNameEditor } from './components/EmployeeNameEditor';
import { EmployeeActionBar } from './components/EmployeeActionBar';
import { AdvancedTab } from './sections/AdvancedTab';
import { TriggerDialog } from './components/TriggerDialog';
import { DeleteDialog } from './components/DeleteDialog';

export function EmployeeDetail() {
  const { archetypeId } = useParams<{ archetypeId: string }>();
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get('tab') ?? 'profile';

  const handleTabChange = (value: string) => {
    if (value === 'activity') {
      navigate(`/dashboard/tasks?employee=${archetypeId ?? ''}&tenant=${tenantId}`);
      return;
    }
    const next = new URLSearchParams(searchParams);
    if (value === 'profile') {
      next.delete('tab');
    } else {
      next.set('tab', value);
    }
    setSearchParams(next, { replace: true });
  };

  const [triggering, setTriggering] = useState(false);
  const [triggerModalOpen, setTriggerModalOpen] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchArchetype = useCallback(
    () =>
      gatewayFetch<Archetype[]>(
        `/admin/tenants/${tenantId}/archetypes?id=${archetypeId ?? ''}`,
      ).then((arr) => arr[0] ?? null),
    [archetypeId, tenantId],
  );

  const { data: archetype, error, loading, refresh } = usePoll<Archetype | null>(fetchArchetype);

  const fetchTenant = useCallback(
    () => gatewayFetch<Tenant>(`/admin/tenants/${tenantId}`),
    [tenantId],
  );
  const { data: tenant } = usePoll<Tenant | null>(fetchTenant);

  const handleTrigger = async (prompt?: string) => {
    if (!archetype?.role_name) return;
    setTriggering(true);
    try {
      const result = await triggerEmployee(tenantId, archetype.role_name, false, undefined, prompt);
      if (result.task_id) {
        toast.success('Task created', {
          description: result.task_id,
          action: {
            label: 'View',
            onClick: () => navigate(`/dashboard/tasks/${result.task_id}`),
          },
        });
      }
      setTriggerModalOpen(false);
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

  const handleFinalize = async () => {
    if (!archetype) return;
    if (!archetype.role_name?.trim() || !archetype.identity?.trim()) {
      toast.error('Role name and identity are required');
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
          <EmployeeNameEditor
            roleName={archetype.role_name}
            archetypeId={archetype.id}
            tenantId={tenantId}
            onSaved={refresh}
          />
        </div>

        <EmployeeActionBar
          archetype={archetype}
          triggering={triggering}
          dryRunning={dryRunning}
          finalizing={finalizing}
          showWebhookButton={showWebhookButton}
          onTriggerClick={() => {
            const hasEveryRunInputs = (archetype.input_schema ?? []).some(
              (item) => item.frequency === 'every_run',
            );
            if (hasEveryRunInputs) {
              navigate(`/dashboard/employees/${archetype.id}/trigger?tenant=${tenantId}`);
            } else {
              setTriggerModalOpen(true);
            }
          }}
          onDryRun={() => void handleDryRun()}
          onFinalize={() => void handleFinalize()}
          onDeleteClick={() => setDeleteDialogOpen(true)}
        />
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-6">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="debug">Debug</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <EmployeeProfileLayout
            archetype={archetype}
            mode={mode}
            tenantId={tenantId}
            onSaved={refresh}
          />
        </TabsContent>

        <TabsContent value="training">
          <div className="rounded-lg border bg-card px-5 py-4">
            <TrainingTab archetypeId={archetype.id} tenantId={tenantId} />
          </div>
        </TabsContent>

        <TabsContent value="advanced">
          <AdvancedTab
            archetype={archetype}
            tenantId={tenantId}
            tenant={tenant ?? null}
            onSaved={refresh}
          />
        </TabsContent>

        <TabsContent value="debug">
          <DebugTab archetypeId={archetype.id} tenantId={tenantId} archetype={archetype} />
        </TabsContent>
      </Tabs>

      <TriggerDialog
        open={triggerModalOpen}
        roleName={archetype.role_name}
        triggering={triggering}
        onOpenChange={(open) => setTriggerModalOpen(open)}
        onTrigger={(prompt) => void handleTrigger(prompt)}
      />

      <DeleteDialog
        open={deleteDialogOpen}
        roleName={archetype.role_name}
        loading={deleteLoading}
        onOpenChange={setDeleteDialogOpen}
        onDelete={() => void handleDelete()}
      />
    </div>
  );
}
