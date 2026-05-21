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
  const [value, setValue] = useState(archetype.agents_md ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setValue(archetype.agents_md ?? '');
    }
  }, [archetype.agents_md, editing]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await patchArchetype(tenantId, archetype.id, { agents_md: value || null });
      toast.success('Personality saved');
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(archetype.agents_md ?? '');
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
      id="section-personality"
      title="Personality"
      subtitle="How this employee approaches their work"
      defaultOpen={true}
      actions={editButton}
    >
      <InlineEditableMarkdown
        label="Personality"
        value={value}
        onChange={setValue}
        onSave={handleSave}
        onCancel={handleCancel}
        editing={editing}
        saving={saving}
        error={error}
        emptyText="No personality configured yet. Click Edit to add one."
        minHeight={300}
      />
    </CollapsibleSection>
  );
}
