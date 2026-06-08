import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fireHostfullyWebhook } from '@/lib/gateway';
import { toast } from 'sonner';
import type { Archetype } from '@/lib/types';

interface EmployeeActionBarProps {
  archetype: Archetype;
  triggering: boolean;
  dryRunning: boolean;
  finalizing: boolean;
  showWebhookButton: boolean;
  onTriggerClick: () => void;
  onDryRun: () => void;
  onFinalize: () => void;
  onDeleteClick: () => void;
}

export function EmployeeActionBar({
  archetype,
  triggering,
  dryRunning,
  finalizing,
  showWebhookButton,
  onTriggerClick,
  onDryRun,
  onFinalize,
  onDeleteClick,
}: EmployeeActionBarProps) {
  const [firingWebhook, setFiringWebhook] = useState(false);

  const handleFireWebhook = async () => {
    setFiringWebhook(true);
    const messageUid = `test-msg-${Date.now()}`;
    try {
      await fireHostfullyWebhook(messageUid);
      toast.success('Webhook fired — check Task Feed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setFiringWebhook(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={triggering || !archetype.role_name}
        onClick={onTriggerClick}
      >
        {triggering ? 'Triggering…' : 'Trigger'}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={dryRunning || !archetype.role_name}
        onClick={onDryRun}
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
            !archetype.identity?.trim() ||
            !archetype.notification_channel?.trim()
          }
          onClick={onFinalize}
        >
          {finalizing ? 'Creating…' : 'Create Employee'}
        </Button>
      )}
      <Button size="sm" variant="destructive" onClick={onDeleteClick}>
        Delete
      </Button>
    </div>
  );
}
