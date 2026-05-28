import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { patchArchetype } from '@/lib/gateway';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { InlineEditableMarkdown } from '../components/InlineEditableMarkdown';
import { Button } from '@/components/ui/button';
import type { Archetype } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';

interface PersonalitySectionProps {
  archetype: Archetype;
  mode: ProfileMode;
  onSaved: () => void;
  tenantId: string;
}

export function PersonalitySection({
  archetype,
  mode,
  onSaved,
  tenantId,
}: PersonalitySectionProps) {
  const [editing, setEditing] = useState(mode === 'edit' || mode === 'create');
  const [value, setValue] = useState(archetype.identity ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setValue(archetype.identity ?? '');
    }
  }, [archetype.identity, editing]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchArchetype(tenantId, archetype.id, { identity: value || null });
      toast.success('Identity saved');
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(archetype.identity ?? '');
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
      id="section-identity"
      title="Identity"
      subtitle="Who this employee is, their personality, and organizational context"
      defaultOpen={true}
      actions={editButton}
    >
      <InlineEditableMarkdown
        label="Identity"
        value={value}
        onChange={setValue}
        onSave={handleSave}
        onCancel={handleCancel}
        editing={editing}
        saving={saving}
        error={error}
        emptyText="No identity configured yet. Click Edit to describe who this employee is."
        minHeight={300}
      />
    </CollapsibleSection>
  );
}
