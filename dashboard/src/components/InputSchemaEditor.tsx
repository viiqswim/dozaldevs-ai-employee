import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import type { InputSchemaItem } from '@/lib/types';

interface InputSchemaEditorProps {
  value: InputSchemaItem[];
  onChange: (schema: InputSchemaItem[]) => void;
  readOnly?: boolean;
}

const TYPE_ICONS: Record<InputSchemaItem['type'], string> = {
  date: '📅',
  number: '🔢',
  url: '🔗',
  text: '📝',
  long_text: '📝',
  select: '📋',
};

const TYPE_LABELS: Record<InputSchemaItem['type'], string> = {
  text: 'text',
  long_text: 'long text',
  date: 'date',
  number: 'number',
  url: 'url',
  select: 'select',
};

const TYPE_OPTIONS: { value: InputSchemaItem['type']; label: string }[] = [
  { value: 'text', label: '📝 Text' },
  { value: 'long_text', label: '📝 Long Text' },
  { value: 'date', label: '📅 Date' },
  { value: 'number', label: '🔢 Number' },
  { value: 'url', label: '🔗 URL' },
  { value: 'select', label: '📋 Select' },
];

const SNAKE_CASE_RE = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

function toSnakeCase(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

interface ValidationErrors {
  key?: string;
  label?: string;
  options?: string;
}

function validate(item: InputSchemaItem): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!item.label.trim()) errors.label = 'Label is required';
  if (item.key && !SNAKE_CASE_RE.test(item.key)) errors.key = 'Must be snake_case (e.g. my_field)';
  if (item.type === 'select' && (!item.options || item.options.length === 0))
    errors.options = 'Select type requires at least one option';
  return errors;
}

export function InputSchemaEditor({ value, onChange, readOnly = false }: InputSchemaEditorProps) {
  const [expandedIndexes, setExpandedIndexes] = useState<Set<number>>(new Set());
  const [manualKeyIndexes, setManualKeyIndexes] = useState<Set<number>>(new Set());

  function toggleExpand(idx: number) {
    if (readOnly) return;
    setExpandedIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function updateItem(idx: number, patch: Partial<InputSchemaItem>) {
    onChange(value.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  }

  function handleLabelChange(idx: number, label: string) {
    if (manualKeyIndexes.has(idx)) {
      updateItem(idx, { label });
    } else {
      updateItem(idx, { label, key: toSnakeCase(label) });
    }
  }

  function handleKeyChange(idx: number, key: string) {
    setManualKeyIndexes((prev) => new Set(prev).add(idx));
    updateItem(idx, { key });
  }

  function addItem() {
    const newIdx = value.length;
    const newItem: InputSchemaItem = {
      key: '',
      label: '',
      type: 'text',
      frequency: 'every_run',
      required: true,
    };
    onChange([...value, newItem]);
    setExpandedIndexes((prev) => new Set(prev).add(newIdx));
  }

  function deleteItem(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
    setExpandedIndexes((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
    setManualKeyIndexes((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i < idx) next.add(i);
        else if (i > idx) next.add(i - 1);
      });
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {value.length === 0 && (
        <div className="rounded-lg border border-dashed border-input bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          No inputs defined.{!readOnly && ' Click "Add Input" to add one.'}
        </div>
      )}

      {value.map((item, idx) => {
        const expanded = expandedIndexes.has(idx);
        const errors = expanded ? validate(item) : {};

        return (
          <Card key={idx} className="overflow-hidden">
            <div
              className={cn(
                'flex items-center gap-2 px-4 py-3 select-none',
                !readOnly && 'cursor-pointer hover:bg-muted/40 transition-colors',
              )}
              onClick={() => toggleExpand(idx)}
              role={readOnly ? undefined : 'button'}
              tabIndex={readOnly ? undefined : 0}
              onKeyDown={(e) => {
                if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  toggleExpand(idx);
                }
              }}
            >
              <span className="text-base leading-none shrink-0" aria-hidden="true">
                {TYPE_ICONS[item.type]}
              </span>

              <span className="flex-1 truncate font-medium text-sm">
                {item.label || (
                  <span className="text-muted-foreground italic font-normal">Untitled input</span>
                )}
              </span>

              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className="text-xs py-0 h-5 font-normal">
                  {TYPE_LABELS[item.type]}
                </Badge>
                <Badge
                  variant={item.frequency === 'every_run' ? 'default' : 'secondary'}
                  className="text-xs py-0 h-5 font-normal"
                >
                  {item.frequency === 'every_run' ? 'Every run' : 'Set once'}
                </Badge>
                {item.required && (
                  <span
                    className="text-destructive font-bold text-sm leading-none"
                    title="Required"
                    aria-label="Required"
                  >
                    *
                  </span>
                )}
              </div>

              {!readOnly && (
                <span className="ml-1 text-muted-foreground text-xs shrink-0" aria-hidden="true">
                  {expanded ? '▼' : '▶'}
                </span>
              )}
            </div>

            {expanded && !readOnly && (
              <div
                className="border-t border-input px-4 pb-4 pt-3 space-y-3 bg-muted/10"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Label <span className="text-destructive">*</span>
                    </label>
                    <Input
                      value={item.label}
                      onChange={(e) => handleLabelChange(idx, e.target.value)}
                      placeholder="e.g. Report Date"
                      className={errors.label ? 'border-destructive' : ''}
                    />
                    {errors.label && <p className="text-xs text-destructive">{errors.label}</p>}
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Key (snake_case)
                    </label>
                    <Input
                      value={item.key}
                      onChange={(e) => handleKeyChange(idx, e.target.value)}
                      placeholder="e.g. report_date"
                      className={errors.key ? 'border-destructive' : ''}
                    />
                    {errors.key && <p className="text-xs text-destructive">{errors.key}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Type
                    </label>
                    <SearchableSelect
                      options={TYPE_OPTIONS}
                      value={item.type}
                      onValueChange={(v) => updateItem(idx, { type: v as InputSchemaItem['type'] })}
                      searchPlaceholder="Search types..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Frequency
                    </label>
                    <div className="flex gap-4 h-9 items-center">
                      <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name={`frequency-${idx}`}
                          value="every_run"
                          checked={item.frequency === 'every_run'}
                          onChange={() => updateItem(idx, { frequency: 'every_run' })}
                          className="accent-primary"
                        />
                        Every run
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name={`frequency-${idx}`}
                          value="once"
                          checked={item.frequency === 'once'}
                          onChange={() => updateItem(idx, { frequency: 'once' })}
                          className="accent-primary"
                        />
                        Set once
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`required-${idx}`}
                    checked={item.required}
                    onChange={(e) => updateItem(idx, { required: e.target.checked })}
                    className="h-4 w-4 rounded border-input accent-primary cursor-pointer"
                  />
                  <label htmlFor={`required-${idx}`} className="text-sm cursor-pointer select-none">
                    Required field
                  </label>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Description{' '}
                    <span className="text-muted-foreground/60 normal-case font-normal">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    value={item.description ?? ''}
                    onChange={(e) => updateItem(idx, { description: e.target.value || undefined })}
                    placeholder="Brief description shown to the employee"
                    rows={2}
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Default Value{' '}
                    <span className="text-muted-foreground/60 normal-case font-normal">
                      (optional)
                    </span>
                  </label>
                  <Input
                    value={item.default_value ?? ''}
                    onChange={(e) =>
                      updateItem(idx, { default_value: e.target.value || undefined })
                    }
                    placeholder="Default value if not provided"
                  />
                </div>

                {item.type === 'select' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Options <span className="text-destructive">*</span>{' '}
                      <span className="text-muted-foreground/60 normal-case font-normal">
                        (comma-separated)
                      </span>
                    </label>
                    <Input
                      value={item.options?.join(', ') ?? ''}
                      onChange={(e) => {
                        const options = e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        updateItem(idx, { options });
                      }}
                      placeholder="Option A, Option B, Option C"
                      className={errors.options ? 'border-destructive' : ''}
                    />
                    {errors.options && <p className="text-xs text-destructive">{errors.options}</p>}
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <Button variant="destructive" size="sm" onClick={() => deleteItem(idx)}>
                    Delete Input
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {!readOnly && (
        <Button variant="outline" size="sm" onClick={addItem} className="w-full mt-1">
          + Add Input
        </Button>
      )}
    </div>
  );
}
