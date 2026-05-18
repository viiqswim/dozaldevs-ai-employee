import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import type { Archetype } from '@/lib/types';

interface CreateEmployeeNextStepsProps {
  archetype: Archetype;
  tenantId: string;
  onClose: () => void;
}

function getTriggerInstructions(
  archetype: Archetype,
  tenantId: string,
): { label: string; snippet: string } {
  const roleName = archetype.role_name ?? archetype.id;
  const endpoint = `/admin/tenants/${tenantId}/employees/${roleName}/trigger`;

  switch (archetype.trigger_sources?.type) {
    case 'scheduled':
      return {
        label: 'Set up a cron job pointing to:',
        snippet: `POST ${endpoint}`,
      };
    case 'webhook':
      return {
        label: 'Configure your webhook source to POST to:',
        snippet: endpoint,
      };
    default:
      return {
        label: 'Trigger via admin API:',
        snippet: `POST ${endpoint}`,
      };
  }
}

export function CreateEmployeeNextSteps({
  archetype,
  tenantId,
  onClose,
}: CreateEmployeeNextStepsProps) {
  const navigate = useNavigate();
  const roleName = archetype.role_name ?? archetype.id;
  const trigger = getTriggerInstructions(archetype, tenantId);

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2 pb-2 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
          <svg
            className="h-5 w-5 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 className="text-base font-semibold">Employee Created!</h3>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">{roleName}</span> is ready to work.
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-muted/30 px-4 py-3 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">1. Trigger it</p>
          <p className="text-xs text-muted-foreground">{trigger.label}</p>
          <code className="block text-xs bg-muted px-2 py-1 rounded font-mono break-all">
            {trigger.snippet}
          </code>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">2. Test it</p>
          <p className="text-xs text-muted-foreground">
            Use the <span className="font-medium text-foreground">Dry Run</span> button on the
            employees list to test without side effects.
          </p>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">3. Edit it</p>
          <p className="text-xs text-muted-foreground">
            Click the employee name in the list to view and edit all configuration.
          </p>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button onClick={() => navigate(`/dashboard/employees/${archetype.id}`)}>
          Go to Employee
        </Button>
      </div>
    </div>
  );
}
