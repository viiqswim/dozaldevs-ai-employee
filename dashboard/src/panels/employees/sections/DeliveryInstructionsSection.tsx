import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { patchArchetype } from '@/lib/gateway';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { InlineEditableMarkdown } from '../components/InlineEditableMarkdown';
import { Button } from '@/components/ui/button';
import type { Archetype } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';

interface DeliveryInstructionsSectionProps {
  archetype: Archetype;
  mode: ProfileMode;
  onSaved: () => void;
  tenantId: string;
}

export function DeliveryInstructionsSection({
  archetype,
  mode,
  onSaved,
  tenantId,
}: DeliveryInstructionsSectionProps) {
  const [editing, setEditing] = useState(mode === 'edit' || mode === 'create');
  const [value, setValue] = useState(archetype.delivery_instructions ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setValue(archetype.delivery_instructions ?? '');
    }
  }, [archetype.delivery_instructions, editing]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchArchetype(tenantId, archetype.id, { delivery_instructions: value || null });
      toast.success('Delivery instructions saved');
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(archetype.delivery_instructions ?? '');
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
      id="section-delivery-instructions"
      title="Delivery Instructions"
      subtitle="What this employee does to deliver results"
      defaultOpen={true}
      actions={editButton}
    >
      <InlineEditableMarkdown
        label="Delivery Instructions"
        value={value}
        onChange={setValue}
        onSave={handleSave}
        onCancel={handleCancel}
        editing={editing}
        saving={saving}
        error={error}
        emptyText="No delivery instructions configured. This employee posts output directly without a separate delivery step."
        minHeight={300}
      />
    </CollapsibleSection>
  );
}
