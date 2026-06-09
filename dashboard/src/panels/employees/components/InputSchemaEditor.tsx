import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InputSchemaItem } from '@/lib/types';
import {
  type FormState,
  DEFAULT_FORM,
  itemToForm,
  formToItem,
  InlineForm,
  ItemRow,
} from './input-schema-shared';

type EditingState = { kind: 'add' } | { kind: 'edit'; index: number } | null;

export interface InputSchemaEditorProps {
  items: InputSchemaItem[];
  instructions: string;
  onChange: (items: InputSchemaItem[]) => void;
}

export function InputSchemaEditor({ items, onChange }: InputSchemaEditorProps) {
  const [editing, setEditing] = useState<EditingState>(null);

  const handleAddSave = (form: FormState) => {
    const newItem = formToItem(form);
    onChange([...items, newItem]);
    setEditing(null);
  };

  const handleEditSave = (form: FormState, index: number) => {
    const updated = items.map((item, i) => (i === index ? formToItem(form) : item));
    onChange(updated);
    setEditing(null);
  };

  const handleDelete = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const handleCancel = () => {
    setEditing(null);
  };

  return (
    <div className="space-y-2">
      {items.length === 0 && editing === null && (
        <p className="text-sm text-muted-foreground">No trigger inputs defined.</p>
      )}

      {items.map((item, i) => {
        const isEditingThis = editing?.kind === 'edit' && editing.index === i;
        if (isEditingThis) {
          return (
            <InlineForm
              key={i}
              initial={itemToForm(item)}
              onSave={(form) => handleEditSave(form, i)}
              onCancel={handleCancel}
            />
          );
        }
        return (
          <ItemRow
            key={i}
            item={item}
            onEdit={() => setEditing({ kind: 'edit', index: i })}
            onDelete={() => handleDelete(i)}
          />
        );
      })}

      {editing?.kind === 'add' && (
        <InlineForm
          initial={DEFAULT_FORM}
          onSave={(form) => handleAddSave(form)}
          onCancel={handleCancel}
        />
      )}

      {editing === null && (
        <div className="pt-1">
          <Button variant="outline" size="sm" onClick={() => setEditing({ kind: 'add' })}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Add input
          </Button>
        </div>
      )}
    </div>
  );
}
