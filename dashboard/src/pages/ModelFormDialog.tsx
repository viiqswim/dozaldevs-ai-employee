import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ModelForm } from './model-catalog-form';

export function FormField({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium leading-none">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function SwitchField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2.5">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

interface ModelFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (form: ModelForm) => Promise<void>;
  initial: ModelForm;
  title: string;
  saving: boolean;
}

export function ModelFormDialog({
  open,
  onClose,
  onSave,
  initial,
  title,
  saving,
}: ModelFormDialogProps) {
  const [form, setForm] = useState<ModelForm>(initial);

  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);

  const set = (key: keyof ModelForm, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSave(form);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Configure the AI model details and performance metrics.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Identity
            </p>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Model ID" hint="e.g. anthropic/claude-haiku-4-5">
                <Input
                  value={form.model_id}
                  onChange={(e) => set('model_id', e.target.value)}
                  placeholder="provider/model-name"
                  required
                />
              </FormField>
              <FormField label="Display Name">
                <Input
                  value={form.display_name}
                  onChange={(e) => set('display_name', e.target.value)}
                  placeholder="Claude Haiku 4.5"
                  required
                />
              </FormField>
            </div>
            <FormField label="Provider">
              <Input
                value={form.provider}
                onChange={(e) => set('provider', e.target.value)}
                placeholder="anthropic"
                required
              />
            </FormField>
            <FormField label="Description">
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                placeholder="Brief description of this model's strengths..."
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </FormField>
          </div>

          <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pricing
            </p>
            <SwitchField
              label="Free model"
              checked={form.is_free}
              onChange={(v) => set('is_free', v)}
              hint="No cost per token"
            />
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Context window" hint="tokens">
                <Input
                  type="number"
                  value={form.context_window}
                  onChange={(e) => set('context_window', e.target.value)}
                  min={0}
                />
              </FormField>
              <FormField label="Input cost" hint="$ per million tokens">
                <Input
                  type="number"
                  step="0.01"
                  value={form.input_cost_per_million}
                  onChange={(e) => set('input_cost_per_million', e.target.value)}
                  min={0}
                  disabled={form.is_free}
                />
              </FormField>
              <FormField label="Output cost" hint="$ per million tokens">
                <Input
                  type="number"
                  step="0.01"
                  value={form.output_cost_per_million}
                  onChange={(e) => set('output_cost_per_million', e.target.value)}
                  min={0}
                  disabled={form.is_free}
                />
              </FormField>
            </div>
          </div>

          <div className="rounded-lg border bg-card px-5 py-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Capabilities
            </p>
            <SwitchField
              label="Supports tool calls"
              checked={form.supports_tools}
              onChange={(v) => set('supports_tools', v)}
            />
            <SwitchField
              label="Supports structured output"
              checked={form.supports_structured_output}
              onChange={(v) => set('supports_structured_output', v)}
            />
          </div>

          <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Performance metrics{' '}
              <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
            </p>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Quality index" hint="0–100">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.quality_index}
                  onChange={(e) => set('quality_index', e.target.value)}
                  placeholder="—"
                />
              </FormField>
              <FormField label="Throughput" hint="tokens/sec">
                <Input
                  type="number"
                  step="1"
                  min={0}
                  value={form.throughput_tokens_per_sec}
                  onChange={(e) => set('throughput_tokens_per_sec', e.target.value)}
                  placeholder="—"
                />
              </FormField>
              <FormField label="Latency" hint="seconds (TTFT)">
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={form.latency_seconds}
                  onChange={(e) => set('latency_seconds', e.target.value)}
                  placeholder="—"
                />
              </FormField>
              <FormField label="Agentic score" hint="0–100">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.agentic_score}
                  onChange={(e) => set('agentic_score', e.target.value)}
                  placeholder="—"
                />
              </FormField>
              <FormField label="Tool use score" hint="0–100">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.tool_use_score}
                  onChange={(e) => set('tool_use_score', e.target.value)}
                  placeholder="—"
                />
              </FormField>
              <FormField label="Tool error rate" hint="0–1">
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  max={1}
                  value={form.tool_call_error_rate}
                  onChange={(e) => set('tool_call_error_rate', e.target.value)}
                  placeholder="—"
                />
              </FormField>
              <FormField label="Instruction score" hint="0–100">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={100}
                  value={form.instruction_following_score}
                  onChange={(e) => set('instruction_following_score', e.target.value)}
                  placeholder="—"
                />
              </FormField>
              <FormField label="Non-hallucination" hint="0–1">
                <Input
                  type="number"
                  step="0.001"
                  min={0}
                  max={1}
                  value={form.non_hallucination_rate}
                  onChange={(e) => set('non_hallucination_rate', e.target.value)}
                  placeholder="—"
                />
              </FormField>
            </div>
          </div>

          <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Usage Guidance{' '}
              <span className="normal-case font-normal text-muted-foreground/60">(optional)</span>
            </p>
            <FormField label="Strengths — when to use this model">
              <textarea
                value={form.strengths}
                onChange={(e) => set('strengths', e.target.value)}
                placeholder="Describe what this model excels at, its best use cases..."
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </FormField>
            <FormField label="Weaknesses — when NOT to use this model">
              <textarea
                value={form.weaknesses}
                onChange={(e) => set('weaknesses', e.target.value)}
                placeholder="Describe limitations, failure modes, task types to avoid..."
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </FormField>
          </div>

          <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Status
            </p>
            <SwitchField
              label="Active"
              checked={form.is_active}
              onChange={(v) => set('is_active', v)}
              hint="Only active models are available for selection"
            />
            <FormField label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => set('notes', e.target.value)}
                placeholder="Internal notes about this model..."
                rows={2}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </FormField>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save model'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
