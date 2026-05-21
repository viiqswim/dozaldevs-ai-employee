import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { patchArchetype } from '@/lib/gateway';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { InlineEditableMarkdown } from '../components/InlineEditableMarkdown';
import { Button } from '@/components/ui/button';
import type { Archetype } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';

interface AssignmentSectionProps {
  archetype: Archetype;
  mode: ProfileMode;
  onSaved: () => void;
  tenantId: string;
}

export function AssignmentSection({ archetype, mode, onSaved, tenantId }: AssignmentSectionProps) {
  const [editing, setEditing] = useState(mode === 'edit' || mode === 'create');
  const [value, setValue] = useState(archetype.instructions ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setValue(archetype.instructions ?? '');
    }
  }, [archetype.instructions, editing]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchArchetype(tenantId, archetype.id, { instructions: value || null });
      toast.success('Assignment saved');
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(archetype.instructions ?? '');
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
      id="section-assignment"
      title="The Assignment"
      subtitle="What this employee does each time they're triggered"
      defaultOpen={true}
      actions={editButton}
    >
      <InlineEditableMarkdown
        label="The Assignment"
        value={value}
        onChange={setValue}
        onSave={handleSave}
        onCancel={handleCancel}
        editing={editing}
        saving={saving}
        error={error}
        emptyText="No assignment configured yet. Click Edit to add one."
        minHeight={300}
      />
    </CollapsibleSection>
  );
}
