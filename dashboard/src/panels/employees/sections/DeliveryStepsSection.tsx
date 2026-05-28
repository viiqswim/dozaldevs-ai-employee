import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { patchArchetype } from '@/lib/gateway';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { Button } from '@/components/ui/button';
import type { Archetype } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';

interface DeliveryStepsSectionProps {
  archetype: Archetype;
  mode: ProfileMode;
  onSaved: () => void;
  tenantId: string;
}

export function DeliveryStepsSection({
  archetype,
  mode,
  onSaved,
  tenantId,
}: DeliveryStepsSectionProps) {
  const [editing, setEditing] = useState(mode === 'edit' || mode === 'create');
  const [value, setValue] = useState(archetype.delivery_steps ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setValue(archetype.delivery_steps ?? '');
    }
  }, [archetype.delivery_steps, editing]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchArchetype(tenantId, archetype.id, { delivery_steps: value || null });
      toast.success('Delivery steps saved');
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(archetype.delivery_steps ?? '');
    setError(null);
    setEditing(false);
  };

  const editButton = !editing ? (
    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
      Edit
    </Button>
  ) : null;

  return (
    <CollapsibleSection
      id="section-delivery-steps"
      title="Delivery Steps"
      subtitle="Numbered steps this employee follows after work is approved"
      defaultOpen={true}
      actions={editButton}
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-md border bg-background px-3 py-2 font-mono text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring min-h-[300px]"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={'1. First delivery step\n2. Second delivery step\n3. Third delivery step'}
            disabled={saving}
          />
          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="outline" size="sm" disabled={saving} onClick={handleCancel}>
              Cancel
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      ) : value?.trim() ? (
        <pre className="whitespace-pre-wrap font-mono text-sm bg-muted/30 p-4 rounded-md">
          {value}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No delivery steps configured. This employee posts output directly without a separate
          delivery step.
        </p>
      )}
    </CollapsibleSection>
  );
}
