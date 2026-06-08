import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { triggerEmployee, restoreArchetype, fireHostfullyWebhook } from '@/lib/gateway';
import { useTenant } from '@/hooks/use-tenant';
import { toast } from 'sonner';
import type { Archetype } from '@/lib/types';

interface EmployeeRowActionsProps {
  archetype: Archetype;
  refresh: () => void;
  onDeleteClick: () => void;
}

export function EmployeeRowActions({ archetype, refresh, onDeleteClick }: EmployeeRowActionsProps) {
  const { tenantId } = useTenant();
  const navigate = useNavigate();
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

  const isLoading = (action: string) => loadingStates[action] ?? false;
  const setLoading = (action: string, val: boolean) =>
    setLoadingStates((prev) => ({ ...prev, [action]: val }));

  const isDeleted = archetype.deleted_at !== null;
  const isDraft = archetype.status === 'draft';
  const isGuestMessaging = archetype.role_name === 'guest-messaging';

  const handleTrigger = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!archetype.role_name) return;

    const hasEveryRunInputs = (archetype.input_schema ?? []).some(
      (item) => item.frequency === 'every_run',
    );
    if (hasEveryRunInputs) {
      navigate(`/dashboard/employees/${archetype.id}/trigger`);
      return;
    }

    setLoading('trigger', true);
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
      setLoading('trigger', false);
    }
  };

  const handleDryRun = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!archetype.role_name) return;
    setLoading('dryrun', true);
    try {
      await triggerEmployee(tenantId, archetype.role_name, true);
      toast.success('Dry run OK — would fire');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading('dryrun', false);
    }
  };

  const handleRestore = async () => {
    if (!tenantId) return;
    try {
      await restoreArchetype(tenantId, archetype.id);
      toast.success('Employee restored');
      refresh();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('409')) {
        toast.error('Cannot restore: role name already taken by an active employee');
      } else {
        toast.error('Failed to restore employee');
      }
    }
  };

  const handleFireWebhook = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setLoading('webhook', true);
    const messageUid = `test-msg-${Date.now()}`;
    try {
      await fireHostfullyWebhook(messageUid);
      toast.success('Webhook fired — check Task Feed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading('webhook', false);
    }
  };

  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {isDeleted ? (
        <Button variant="outline" size="sm" onClick={() => void handleRestore()}>
          Restore
        </Button>
      ) : (
        <>
          {!isDraft && (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={isLoading('trigger') || !archetype.role_name}
                onClick={(e) => void handleTrigger(e)}
              >
                {isLoading('trigger') ? 'Triggering…' : 'Trigger'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={isLoading('dryrun') || !archetype.role_name}
                onClick={(e) => void handleDryRun(e)}
              >
                {isLoading('dryrun') ? 'Running…' : 'Dry Run'}
              </Button>
              {isGuestMessaging && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isLoading('webhook')}
                  onClick={(e) => void handleFireWebhook(e)}
                >
                  {isLoading('webhook') ? 'Firing…' : 'Fire Webhook'}
                </Button>
              )}
            </>
          )}
          <Button variant="destructive" size="sm" onClick={onDeleteClick}>
            Delete
          </Button>
        </>
      )}
    </div>
  );
}
