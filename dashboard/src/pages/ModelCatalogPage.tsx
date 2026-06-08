import { useCallback, useEffect, useState } from 'react';
import {
  listModelCatalog,
  createModelCatalogEntry,
  updateModelCatalogEntry,
  deleteModelCatalogEntry,
} from '@/lib/gateway';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Plus, Search } from 'lucide-react';
import type { ModelCatalogEntry } from '@/lib/types';
import { GATEWAY_LABEL } from '@/lib/model-badge-utils';
import { type ModelForm, EMPTY_FORM, entryToForm, formToPayload } from './model-catalog-form';
import { ModelFormDialog } from './ModelFormDialog';
import { ModelTableRow } from './ModelTableRow';
import { useModelCatalogParams } from './model-catalog-params';

export function ModelCatalogPage() {
  const {
    modal,
    editingId,
    removingId,
    query,
    providerFilter,
    setModal,
    setEditing,
    setRemoving,
    closeAll,
    setQuery,
    setProviderFilter,
  } = useModelCatalogParams();

  const [models, setModels] = useState<ModelCatalogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
    { value: '', label: 'All makers' },
    ...allProviders.map((p) => ({ value: p, label: p })),
  ];

  const filtered = (models ?? []).filter((m) => {
    const q = query.toLowerCase();
    const matchesQuery =
      q === '' ||
      m.display_name.toLowerCase().includes(q) ||
      m.model_id.toLowerCase().includes(q) ||
      m.provider.toLowerCase().includes(q) ||
      m.supported_gateways.some(
        (gw) => gw.toLowerCase().includes(q) || (GATEWAY_LABEL[gw] ?? '').toLowerCase().includes(q),
      );
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
              placeholder="Search by name, model ID, or maker…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <SearchableSelect
            options={providerOptions}
            value={providerFilter}
            onValueChange={setProviderFilter}
            placeholder="All makers"
            searchPlaceholder="Search makers…"
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
                <TableHead>Served by</TableHead>
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
                filtered.map((model) => (
                  <ModelTableRow
                    key={model.id}
                    model={model}
                    onEdit={setEditing}
                    onRemove={setRemoving}
                    onToggleActive={handleToggleActive}
                  />
                ))
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
