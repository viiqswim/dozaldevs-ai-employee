import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { InputSchemaItem } from '@/lib/types';

const inputCls =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

function FormField({
  item,
  value,
  onChange,
}: {
  item: InputSchemaItem;
  value: string;
  onChange: (val: string) => void;
}) {
  const placeholder = item.description ?? `Enter ${item.label}`;

  let fieldEl: React.ReactNode;

  if (item.type === 'long_text') {
    fieldEl = (
      <textarea
        className={`${inputCls} min-h-[80px] resize-y`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  } else if (item.type === 'select' && item.options && item.options.length > 0) {
    fieldEl = (
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {item.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  } else {
    const typeMap: Record<InputSchemaItem['type'], string> = {
      text: 'text',
      long_text: 'text',
      date: 'date',
      number: 'number',
      url: 'url',
      select: 'text',
    };
    fieldEl = (
      <input
        className={inputCls}
        type={typeMap[item.type]}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium">
        {item.label}
        {item.required && <span className="ml-1 text-destructive">*</span>}
      </label>
      {item.description && <p className="text-xs text-muted-foreground">{item.description}</p>}
      {fieldEl}
    </div>
  );
}

interface RerunDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputSchema: InputSchemaItem[];
  initialInputs: Record<string, string>;
  onRerun: (inputs: Record<string, string>) => Promise<void>;
}

export function RerunDialog({
  open,
  onOpenChange,
  inputSchema,
  initialInputs,
  onRerun,
}: RerunDialogProps) {
  const [rerunInputs, setRerunInputs] = useState<Record<string, string>>(initialInputs);
  const [rerunSubmitting, setRerunSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setRerunInputs(initialInputs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    setRerunSubmitting(true);
    try {
      await onRerun(rerunInputs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to re-trigger task');
    } finally {
      setRerunSubmitting(false);
    }
  };

  const everyRunFields = inputSchema.filter((f) => f.frequency === 'every_run');

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Re-run Task</DialogTitle>
          <DialogDescription>
            Edit inputs below, then click Re-run to start a new task.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {everyRunFields.length > 0 ? (
            everyRunFields.map((item) => (
              <FormField
                key={item.key}
                item={item}
                value={rerunInputs[item.key] ?? ''}
                onChange={(val) => setRerunInputs((prev) => ({ ...prev, [item.key]: val }))}
              />
            ))
          ) : (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Prompt</label>
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px] resize-y placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={rerunInputs['prompt'] ?? ''}
                onChange={(e) => setRerunInputs((prev) => ({ ...prev, prompt: e.target.value }))}
                placeholder="Enter instructions for this employee..."
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={rerunSubmitting}>
            Cancel
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={rerunSubmitting}>
            {rerunSubmitting ? 'Running...' : 'Re-run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
