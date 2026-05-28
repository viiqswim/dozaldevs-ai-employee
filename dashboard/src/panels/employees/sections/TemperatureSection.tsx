import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { patchArchetype } from '@/lib/gateway';
import { CollapsibleSection } from '../components/CollapsibleSection';
import { Button } from '@/components/ui/button';
import type { Archetype } from '@/lib/types';
import type { ProfileMode } from '@/lib/profile-constants';

interface TemperatureSectionProps {
  archetype: Archetype;
  mode: ProfileMode;
  onSaved: () => void;
  tenantId: string;
}

export function TemperatureSection({
  archetype,
  mode,
  onSaved,
  tenantId,
}: TemperatureSectionProps) {
  const [editing, setEditing] = useState(mode === 'edit' || mode === 'create');
  const [value, setValue] = useState<string>(
    archetype.temperature !== null && archetype.temperature !== undefined
      ? String(archetype.temperature)
      : '1.0',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setValue(
        archetype.temperature !== null && archetype.temperature !== undefined
          ? String(archetype.temperature)
          : '1.0',
      );
    }
  }, [archetype.temperature, editing]);

  const handleSave = async () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0 || parsed > 2) {
      setError('Temperature must be a number between 0.0 and 2.0');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchArchetype(tenantId, archetype.id, { temperature: parsed });
      toast.success('Temperature saved');
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setValue(
      archetype.temperature !== null && archetype.temperature !== undefined
        ? String(archetype.temperature)
        : '1.0',
    );
    setError(null);
    setEditing(false);
  };

  const editButton = !editing ? (
    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
      Edit
    </Button>
  ) : null;

  const displayValue =
    archetype.temperature !== null && archetype.temperature !== undefined
      ? archetype.temperature.toFixed(1)
      : '1.0 (default)';

  return (
    <CollapsibleSection
      id="section-temperature"
      title="Temperature"
      subtitle="Controls how creative vs. predictable the AI responses are (0.0 = focused, 2.0 = creative)"
      defaultOpen={false}
      actions={editButton}
    >
      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <input
              type="number"
              className="w-28 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={value}
              min={0}
              max={2}
              step={0.1}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              disabled={saving}
            />
            <span className="text-sm text-muted-foreground">0.0 – 2.0</span>
          </div>
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
      ) : (
        <p className="text-sm">{displayValue}</p>
      )}
    </CollapsibleSection>
  );
}
