import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { patchArchetype } from '@/lib/gateway';
import { toast } from 'sonner';

const KEBAB_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface EmployeeNameEditorProps {
  roleName: string | null;
  archetypeId: string;
  tenantId: string;
  onSaved: () => void;
}

export function EmployeeNameEditor({
  roleName,
  archetypeId,
  tenantId,
  onSaved,
}: EmployeeNameEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const escapeRef = useRef(false);

  const handleSave = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError('Name is required');
      return;
    }
    if (!KEBAB_REGEX.test(trimmed)) {
      setError('Use lowercase letters, numbers, and hyphens only (e.g. my-employee)');
      return;
    }
    if (trimmed === roleName) {
      setIsEditing(false);
      setError(null);
      return;
    }
    setSaving(true);
    try {
      await patchArchetype(tenantId, archetypeId, { role_name: trimmed });
      toast.success('Name updated');
      onSaved();
      setIsEditing(false);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('409')) {
        toast.error('This name is already taken by an active employee.');
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-0.5">
        <input
          className="text-xl font-semibold bg-transparent border-b border-border focus:border-primary outline-none min-w-[12ch]"
          size={Math.max((editValue?.length ?? 0) + 2, 12)}
          value={editValue}
          autoFocus
          disabled={saving}
          onChange={(e) => {
            setEditValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void handleSave(editValue);
            } else if (e.key === 'Escape') {
              escapeRef.current = true;
              setIsEditing(false);
              setEditValue('');
              setError(null);
            }
          }}
          onBlur={() => {
            if (escapeRef.current) {
              escapeRef.current = false;
              return;
            }
            void handleSave(editValue);
          }}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="group flex items-center gap-1.5 text-xl font-semibold text-left hover:opacity-70 transition-opacity cursor-text"
      onClick={() => {
        setIsEditing(true);
        setEditValue(roleName ?? '');
        setError(null);
      }}
      title="Click to rename"
    >
      {roleName ?? archetypeId}
      <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-40 transition-opacity shrink-0" />
    </button>
  );
}
