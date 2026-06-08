import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { patchArchetype } from '@/lib/gateway';
import { toast } from 'sonner';
import type { InputSchemaItem } from '@/lib/types';
import {
  type FormState,
  DEFAULT_FORM,
  itemToForm,
  formToItem,
  InlineForm,
  ItemRow,
} from '../components/input-schema-shared';

function scrubInstructionReferences(instructions: string, label: string, key: string): string {
  let result = instructions;
  for (const term of [label, key].filter(Boolean)) {
    const esc = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const andClauseContainingTerm = new RegExp(`,?\\s+and\\s+[^.,]*${esc}[^.,]*`, 'gi');
    const sentenceContainingTerm = new RegExp(`[^.!?]*${esc}[^.!?]*[.!?]\\s*`, 'gi');
    result = result.replace(andClauseContainingTerm, '').replace(sentenceContainingTerm, '');
  }
  return result.replace(/\s+/g, ' ').trim();
}

function hasInstructionReferences(instructions: string, label: string, key: string): boolean {
  if (!instructions) return false;
  const lower = instructions.toLowerCase();
  return lower.includes(label.toLowerCase()) || lower.includes(key.toLowerCase());
}

export interface InputSchemaSectionProps {
  items: InputSchemaItem[];
  tenantId: string;
  archetypeId: string;
  instructions?: string;
  onSaved: () => void;
}

type EditingState = { kind: 'add' } | { kind: 'edit'; index: number } | null;

export function InputSchemaSection({
  items,
  tenantId,
  archetypeId,
  instructions = '',
  onSaved,
}: InputSchemaSectionProps) {
  const [editing, setEditing] = useState<EditingState>(null);
  const [saving, setSaving] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [confirmDeleteIndex, setConfirmDeleteIndex] = useState<number | null>(null);
  const [scrubInstructions, setScrubInstructions] = useState(false);

  const save = async (updatedItems: InputSchemaItem[]) => {
    setSaving(true);
    try {
      await patchArchetype(tenantId, archetypeId, { input_schema: updatedItems });
      toast.success('Saved');
      onSaved();
      setEditing(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSave = async (form: FormState) => {
    const newItem = formToItem(form);
    await save([...items, newItem]);
  };

  const handleEditSave = async (form: FormState, index: number) => {
    const updated = items.map((item, i) => (i === index ? formToItem(form) : item));
    await save(updated);
  };

  const handleDelete = async (index: number) => {
    setDeletingIndex(index);
    try {
      const deletedItem = items[index];
      const updatedItems = items.filter((_, i) => i !== index);
      const patch: Parameters<typeof patchArchetype>[2] = { input_schema: updatedItems };
      if (scrubInstructions && deletedItem) {
        patch.instructions = scrubInstructionReferences(
          instructions,
          deletedItem.label,
          deletedItem.key,
        );
      }
      await patchArchetype(tenantId, archetypeId, patch);
      toast.success(scrubInstructions ? 'Removed and instructions updated' : 'Removed');
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove');
    } finally {
      setDeletingIndex(null);
    }
  };

  const handleCancel = () => {
    if (!saving) setEditing(null);
  };

  return (
    <div>
      <hr className="border-border mb-4" />
      <dl>
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-3">
          Trigger Inputs
        </dt>
        <dd>
          <div className="space-y-2">
            {items.length === 0 && editing === null && (
              <p className="text-sm text-muted-foreground">No trigger inputs. Add one below.</p>
            )}

            {items.map((item, i) => {
              const isEditingThis = editing?.kind === 'edit' && editing.index === i;
              if (isEditingThis) {
                return (
                  <InlineForm
                    key={i}
                    initial={itemToForm(item)}
                    saving={saving}
                    onSave={(form) => void handleEditSave(form, i)}
                    onCancel={handleCancel}
                  />
                );
              }
              return (
                <ItemRow
                  key={i}
                  item={item}
                  deleting={deletingIndex === i}
                  onEdit={() => setEditing({ kind: 'edit', index: i })}
                  onDelete={() => {
                    const hasRefs = hasInstructionReferences(instructions, item.label, item.key);
                    setScrubInstructions(hasRefs);
                    setConfirmDeleteIndex(i);
                  }}
                />
              );
            })}

            {editing?.kind === 'add' && (
              <InlineForm
                initial={DEFAULT_FORM}
                saving={saving}
                onSave={(form) => void handleAddSave(form)}
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
        </dd>
      </dl>

      <Dialog
        open={confirmDeleteIndex !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteIndex(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove trigger input?</DialogTitle>
            <DialogDescription>
              {confirmDeleteIndex !== null && items[confirmDeleteIndex]
                ? `Remove "${items[confirmDeleteIndex].label}"? This will take effect immediately.`
                : 'This will take effect immediately.'}
            </DialogDescription>
          </DialogHeader>
          {confirmDeleteIndex !== null &&
            items[confirmDeleteIndex] &&
            hasInstructionReferences(
              instructions,
              items[confirmDeleteIndex].label,
              items[confirmDeleteIndex].key,
            ) && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={scrubInstructions}
                  onChange={(e) => setScrubInstructions(e.target.checked)}
                />
                <span>
                  Also remove mentions of <strong>{items[confirmDeleteIndex].label}</strong> from
                  the employee instructions
                </span>
              </label>
            )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteIndex(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deletingIndex !== null}
              onClick={() => {
                if (confirmDeleteIndex !== null) {
                  void handleDelete(confirmDeleteIndex);
                  setConfirmDeleteIndex(null);
                }
              }}
            >
              {deletingIndex !== null ? 'Removing…' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
