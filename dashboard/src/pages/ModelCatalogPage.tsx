import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  listModelCatalog,
  createModelCatalogEntry,
  updateModelCatalogEntry,
  deleteModelCatalogEntry,
} from '@/lib/gateway';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, Search } from 'lucide-react';
import type { ModelCatalogEntry } from '@/lib/types';

function computeCostTierLabel(
  inputCost: number,
  outputCost: number,
  isFree: boolean,
): 'free' | 'budget' | 'standard' | 'premium' {
  if (isFree) return 'free';
  const avg = (inputCost + outputCost) / 2;
  if (avg < 0.5) return 'budget';
  if (avg < 3.0) return 'standard';
  return 'premium';
}

function computeQualityTierLabel(
  qualityIndex: number | null,
): 'basic' | 'capable' | 'advanced' | 'frontier' | 'unknown' {
  if (qualityIndex === null) return 'unknown';
  if (qualityIndex < 40) return 'basic';
  if (qualityIndex < 60) return 'capable';
  if (qualityIndex < 80) return 'advanced';
  return 'frontier';
}

const COST_TIER_CLASS: Record<string, string> = {
  free: 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
  budget:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  standard:
    'border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  premium:
    'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
};

const QUALITY_TIER_CLASS: Record<string, string> = {
  basic:
    'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
  capable:
    'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
  advanced:
    'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300',
  frontier:
    'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
  unknown: 'border-muted-foreground/20 text-muted-foreground',
};

interface ModelForm {
  model_id: string;
  display_name: string;
  provider: string;
  description: string;
  context_window: string;
  input_cost_per_million: string;
  output_cost_per_million: string;
  is_free: boolean;
  throughput_tokens_per_sec: string;
  latency_seconds: string;
  quality_index: string;
  agentic_score: string;
  tool_use_score: string;
  instruction_following_score: string;
  non_hallucination_rate: string;
  tool_call_error_rate: string;
  structured_output_error_rate: string;
  supports_tools: boolean;
  supports_structured_output: boolean;
  is_active: boolean;
  notes: string;
}

const EMPTY_FORM: ModelForm = {
  model_id: '',
  display_name: '',
  provider: '',
  description: '',
  context_window: '128000',
  input_cost_per_million: '0',
  output_cost_per_million: '0',
  is_free: false,
  throughput_tokens_per_sec: '',
  latency_seconds: '',
  quality_index: '',
  agentic_score: '',
  tool_use_score: '',
  instruction_following_score: '',
  non_hallucination_rate: '',
  tool_call_error_rate: '',
  structured_output_error_rate: '',
  supports_tools: true,
  supports_structured_output: true,
  is_active: true,
  notes: '',
};

function entryToForm(entry: ModelCatalogEntry): ModelForm {
  return {
    model_id: entry.model_id,
    display_name: entry.display_name,
    provider: entry.provider,
    description: entry.description ?? '',
    context_window: String(entry.context_window),
    input_cost_per_million: String(entry.input_cost_per_million),
    output_cost_per_million: String(entry.output_cost_per_million),
    is_free: entry.is_free,
    throughput_tokens_per_sec:
      entry.throughput_tokens_per_sec !== null ? String(entry.throughput_tokens_per_sec) : '',
    latency_seconds: entry.latency_seconds !== null ? String(entry.latency_seconds) : '',
    quality_index: entry.quality_index !== null ? String(entry.quality_index) : '',
    agentic_score: entry.agentic_score !== null ? String(entry.agentic_score) : '',
    tool_use_score: entry.tool_use_score !== null ? String(entry.tool_use_score) : '',
    instruction_following_score:
      entry.instruction_following_score !== null ? String(entry.instruction_following_score) : '',
    non_hallucination_rate:
      entry.non_hallucination_rate !== null ? String(entry.non_hallucination_rate) : '',
    tool_call_error_rate:
      entry.tool_call_error_rate !== null ? String(entry.tool_call_error_rate) : '',
    structured_output_error_rate:
      entry.structured_output_error_rate !== null ? String(entry.structured_output_error_rate) : '',
    supports_tools: entry.supports_tools,
    supports_structured_output: entry.supports_structured_output,
    is_active: entry.is_active,
    notes: entry.notes ?? '',
  };
}

function parseOptionalFloat(val: string): number | null {
  const trimmed = val.trim();
  if (trimmed === '') return null;
  const n = parseFloat(trimmed);
  return isNaN(n) ? null : n;
}

function formToPayload(
  form: ModelForm,
): Omit<ModelCatalogEntry, 'id' | 'created_at' | 'updated_at'> {
  return {
    model_id: form.model_id.trim(),
    display_name: form.display_name.trim(),
    provider: form.provider.trim(),
    description: form.description.trim() || null,
    context_window: parseInt(form.context_window, 10) || 0,
    input_cost_per_million: parseFloat(form.input_cost_per_million) || 0,
    output_cost_per_million: parseFloat(form.output_cost_per_million) || 0,
    is_free: form.is_free,
    throughput_tokens_per_sec: parseOptionalFloat(form.throughput_tokens_per_sec),
    latency_seconds: parseOptionalFloat(form.latency_seconds),
    quality_index: parseOptionalFloat(form.quality_index),
    agentic_score: parseOptionalFloat(form.agentic_score),
    tool_use_score: parseOptionalFloat(form.tool_use_score),
    instruction_following_score: parseOptionalFloat(form.instruction_following_score),
    non_hallucination_rate: parseOptionalFloat(form.non_hallucination_rate),
    tool_call_error_rate: parseOptionalFloat(form.tool_call_error_rate),
    structured_output_error_rate: parseOptionalFloat(form.structured_output_error_rate),
    supports_tools: form.supports_tools,
    supports_structured_output: form.supports_structured_output,
    is_active: form.is_active,
    notes: form.notes.trim() || null,
  };
}

function FormField({
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

function SwitchField({
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

function ModelFormDialog({ open, onClose, onSave, initial, title, saving }: ModelFormDialogProps) {
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

export function ModelCatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [models, setModels] = useState<ModelCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const modal = searchParams.get('modal');
  const editingId = searchParams.get('editing');
  const removingId = searchParams.get('removing');

  const setModal = (value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set('modal', value);
      next.delete('editing');
      next.delete('removing');
    } else {
      next.delete('modal');
    }
    setSearchParams(next, { replace: true });
  };

  const setEditing = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) {
      next.set('editing', id);
      next.delete('modal');
      next.delete('removing');
    } else {
      next.delete('editing');
    }
    setSearchParams(next, { replace: true });
  };

  const setRemoving = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) {
      next.set('removing', id);
      next.delete('modal');
      next.delete('editing');
    } else {
      next.delete('removing');
    }
    setSearchParams(next, { replace: true });
  };

  const closeAll = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('modal');
    next.delete('editing');
    next.delete('removing');
    setSearchParams(next, { replace: true });
  };

  const query = searchParams.get('q') ?? '';
  const providerFilter = searchParams.get('provider') ?? '';

  const setQuery = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set('q', v);
    else next.delete('q');
    setSearchParams(next, { replace: true });
  };

  const setProviderFilter = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set('provider', v);
    else next.delete('provider');
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listModelCatalog()
      .then(setModels)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allProviders: string[] = models
    ? Array.from(new Set(models.map((m) => m.provider))).sort()
    : [];

  const providerOptions = [
    { value: '', label: 'All providers' },
    ...allProviders.map((p) => ({ value: p, label: p })),
  ];

  const filtered = (models ?? []).filter((m) => {
    const q = query.toLowerCase();
    const matchesQuery =
      q === '' ||
      m.display_name.toLowerCase().includes(q) ||
      m.model_id.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q);
    const matchesProvider = providerFilter === '' || m.provider === providerFilter;
    return matchesQuery && matchesProvider;
  });

  const editingEntry = editingId ? (models ?? []).find((m) => m.id === editingId) : undefined;
  const removingEntry = removingId ? (models ?? []).find((m) => m.id === removingId) : undefined;

  const handleAdd = async (form: ModelForm) => {
    setSaving(true);
    try {
      await createModelCatalogEntry(formToPayload(form));
      toast.success('Model added');
      closeAll();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add model');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (form: ModelForm) => {
    if (!editingId) return;
    setSaving(true);
    try {
      await updateModelCatalogEntry(editingId, formToPayload(form));
      toast.success('Model updated');
      closeAll();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update model');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (entry: ModelCatalogEntry) => {
    try {
      await updateModelCatalogEntry(entry.id, { is_active: !entry.is_active });
      toast.success(entry.is_active ? 'Model deactivated' : 'Model activated');
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update model');
    }
  };

  const handleRemove = async () => {
    if (!removingId) return;
    setSaving(true);
    try {
      await deleteModelCatalogEntry(removingId);
      toast.success('Model removed');
      closeAll();
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove model');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-lg border bg-card px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">AI Models</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage the catalog of AI models available to employees.
          </p>
        </div>
        <Button onClick={() => setModal('add')}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add model
        </Button>
      </div>

      <div className="rounded-lg border bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name, model ID, or provider…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <SearchableSelect
            options={providerOptions}
            value={providerFilter}
            onValueChange={setProviderFilter}
            placeholder="All providers"
            searchPlaceholder="Search providers…"
            className="w-48"
          />
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Loading models…
          </div>
        ) : loadError ? (
          <div className="px-5 py-6">
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-semibold">Failed to load models</p>
              <p className="mt-1 text-destructive/80">{loadError.message}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
                onClick={load}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : (models ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base font-medium">No models yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first AI model to the catalog.
            </p>
            <Button className="mt-4" onClick={() => setModal('add')}>
              Add model
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Cost tier</TableHead>
                <TableHead>Quality tier</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No models match your search.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((model) => {
                  const costTier = computeCostTierLabel(
                    model.input_cost_per_million,
                    model.output_cost_per_million,
                    model.is_free,
                  );
                  const qualityTier = computeQualityTierLabel(model.quality_index);
                  return (
                    <TableRow key={model.id}>
                      <TableCell>
                        <p className="font-medium text-sm">{model.display_name}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">
                          {model.model_id}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{model.provider}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={COST_TIER_CLASS[costTier]}>
                          {costTier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={QUALITY_TIER_CLASS[qualityTier]}>
                          {qualityTier}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            model.supports_tools
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-muted-foreground'
                          }
                        >
                          {model.supports_tools ? '✓' : '✗'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={model.is_active}
                          onCheckedChange={() => void handleToggleActive(model)}
                          aria-label={`${model.is_active ? 'Deactivate' : 'Activate'} ${model.display_name}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditing(model.id)}
                            aria-label={`Edit ${model.display_name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setRemoving(model.id)}
                            aria-label={`Remove ${model.display_name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <ModelFormDialog
        open={modal === 'add'}
        onClose={closeAll}
        onSave={handleAdd}
        initial={EMPTY_FORM}
        title="Add AI model"
        saving={saving}
      />

      <ModelFormDialog
        open={!!editingId && !!editingEntry}
        onClose={closeAll}
        onSave={handleEdit}
        initial={editingEntry ? entryToForm(editingEntry) : EMPTY_FORM}
        title={`Edit ${editingEntry?.display_name ?? 'model'}`}
        saving={saving}
      />

      <Dialog open={!!removingId} onOpenChange={(o) => !o && closeAll()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removingEntry?.display_name ?? 'model'}?</DialogTitle>
            <DialogDescription>
              This model will be removed from the catalog. Existing employees using this model will
              not be affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={closeAll} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={saving} onClick={() => void handleRemove()}>
              {saving ? 'Removing…' : 'Remove model'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
