import { useState } from 'react';
import { Pencil, Trash2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { InputSchemaItem } from '@/lib/types';

export const TYPE_LABELS: Record<InputSchemaItem['type'], string> = {
  text: 'Short text',
  long_text: 'Long text',
  date: 'Date',
  number: 'Number',
  url: 'Web link',
  select: 'Dropdown',
};

export const FREQUENCY_LABELS: Record<InputSchemaItem['frequency'], string> = {
  every_run: 'Every run',
  once: 'One time only',
};

export const TYPE_OPTIONS = Object.entries(TYPE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const FREQUENCY_OPTIONS = Object.entries(FREQUENCY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export const KEY_REGEX = /^[a-z][a-z0-9_]*$/;

export function deriveKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^[^a-z]+/, '');
}

export interface FormState {
  label: string;
  type: InputSchemaItem['type'];
  frequency: InputSchemaItem['frequency'];
  required: boolean;
  description: string;
  options: string[];
  default_value: string;
}

export const DEFAULT_FORM: FormState = {
  label: '',
  type: 'text',
  frequency: 'every_run',
  required: false,
  description: '',
  options: [''],
  default_value: '',
};

export function itemToForm(item: InputSchemaItem): FormState {
  return {
    label: item.label,
    type: item.type,
    frequency: item.frequency,
    required: item.required,
    description: item.description ?? '',
    options: item.options && item.options.length > 0 ? item.options : [''],
    default_value: item.default_value ?? '',
  };
}

export function formToItem(form: FormState): InputSchemaItem {
  const item: InputSchemaItem = {
    key: deriveKey(form.label.trim()),
    label: form.label.trim(),
    type: form.type,
    frequency: form.frequency,
    required: form.required,
  };
  if (form.description.trim()) item.description = form.description.trim();
  if (form.type === 'select') {
    item.options = form.options.filter((o) => o.trim() !== '');
  }
  if (form.default_value.trim()) item.default_value = form.default_value.trim();
  return item;
}

export interface FormErrors {
  label?: string;
  key?: string;
  options?: string;
}

export function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!form.label.trim()) {
    errors.label = 'Label is required.';
  }
  const key = deriveKey(form.label.trim());
  if (form.label.trim() && !KEY_REGEX.test(key)) {
    errors.key = 'Could not derive a valid key from this label. Use letters, numbers, or spaces.';
  }
  if (form.type === 'select') {
    const filled = form.options.filter((o) => o.trim() !== '');
    if (filled.length === 0) {
      errors.options = 'At least one option is required for dropdowns.';
    } else if (form.options.some((o) => o.trim() === '')) {
      errors.options = 'Remove blank options before saving.';
    }
  }
  return errors;
}

export interface InlineFormProps {
  initial: FormState;
  saving?: boolean;
  onSave: (form: FormState) => void;
  onCancel: () => void;
}

export function InlineForm({ initial, saving = false, onSave, onCancel }: InlineFormProps) {
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<FormErrors>({});

  const derivedKey = deriveKey(form.label.trim());

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      if (key === 'label') {
        delete next.label;
        delete next.key;
      }
      if (key === 'options') delete next.options;
      return next;
    });
  };

  const handleSave = () => {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    onSave(form);
  };

  const addOption = () => setField('options', [...form.options, '']);
  const removeOption = (i: number) =>
    setField(
      'options',
      form.options.filter((_, idx) => idx !== i),
    );
  const setOption = (i: number, val: string) => {
    const next = [...form.options];
    next[i] = val;
    setField('options', next);
  };

  return (
    <div className="rounded-md border bg-muted/10 p-4 space-y-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Label</label>
        <input
          type="text"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="e.g. Guest name"
          value={form.label}
          disabled={saving}
          onChange={(e) => setField('label', e.target.value)}
        />
        {errors.label && <p className="text-xs text-destructive">{errors.label}</p>}
        {form.label.trim() && !errors.label && (
          <p className="text-xs text-muted-foreground">
            Key: <code className="font-mono">{derivedKey || '—'}</code>
          </p>
        )}
        {errors.key && <p className="text-xs text-destructive">{errors.key}</p>}
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">Type</label>
        <SearchableSelect
          options={TYPE_OPTIONS}
          value={form.type}
          onValueChange={(v) => setField('type', v as InputSchemaItem['type'])}
          placeholder="Select type..."
          searchPlaceholder="Search types..."
          disabled={saving}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">When to collect</label>
        <SearchableSelect
          options={FREQUENCY_OPTIONS}
          value={form.frequency}
          onValueChange={(v) => setField('frequency', v as InputSchemaItem['frequency'])}
          placeholder="Select frequency..."
          searchPlaceholder="Search..."
          disabled={saving}
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="input-schema-required"
          checked={form.required}
          disabled={saving}
          onChange={(e) => setField('required', e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <label
          htmlFor="input-schema-required"
          className="text-xs font-medium text-foreground cursor-pointer select-none"
        >
          Required field
        </label>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          Description <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <textarea
          className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          placeholder="Help text shown to the user"
          value={form.description}
          disabled={saving}
          onChange={(e) => setField('description', e.target.value)}
        />
      </div>

      {form.type === 'select' && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Options</label>
          <div className="space-y-1.5">
            {form.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="text"
                  className="flex h-8 flex-1 rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder={`Option ${i + 1}`}
                  value={opt}
                  disabled={saving}
                  onChange={(e) => setOption(i, e.target.value)}
                />
                {form.options.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={saving}
                    onClick={() => removeOption(i)}
                    className="h-8 w-8 shrink-0"
                    aria-label="Remove option"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={addOption}
              className="h-7 text-xs"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add option
            </Button>
          </div>
          {errors.options && <p className="text-xs text-destructive">{errors.options}</p>}
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium text-foreground">
          Default value <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          type="text"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          placeholder="Pre-filled value"
          value={form.default_value}
          disabled={saving}
          onChange={(e) => setField('default_value', e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export interface ItemRowProps {
  item: InputSchemaItem;
  onEdit: () => void;
  onDelete: () => void;
  deleting?: boolean;
}

export function ItemRow({ item, onEdit, onDelete, deleting = false }: ItemRowProps) {
  return (
    <div className="rounded-md border bg-muted/10 px-3 py-2 flex items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <span className="text-sm font-medium truncate">{item.label}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium shrink-0">
          {TYPE_LABELS[item.type]}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium shrink-0">
          {FREQUENCY_LABELS[item.frequency]}
        </span>
        {item.required && (
          <span className="text-xs font-medium text-destructive shrink-0">Required</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onEdit}
          disabled={deleting}
          aria-label={`Edit ${item.label}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Delete ${item.label}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
