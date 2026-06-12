import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  listPlatformSettings,
  updatePlatformSetting,
  invalidateComposioCache,
} from '@/lib/gateway';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Pencil, X, Check, RefreshCw } from 'lucide-react';
import type { PlatformSetting } from '@/lib/types';

function formatKey(key: string): string {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PlatformSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [settings, setSettings] = useState<PlatformSetting[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [bustingCache, setBustingCache] = useState(false);

  const editingKey = searchParams.get('editing');

  const setEditing = (key: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (key) {
      next.set('editing', key);
    } else {
      next.delete('editing');
    }
    setSearchParams(next, { replace: true });
  };

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listPlatformSettings()
      .then(setSettings)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startEdit = (setting: PlatformSetting) => {
    setEditValue(setting.value);
    setEditing(setting.key);
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditValue('');
  };

  const saveEdit = async () => {
    if (!editingKey) return;
    setSaving(true);
    try {
      const updated = await updatePlatformSetting(editingKey, editValue);
      setSettings((prev) => (prev ? prev.map((s) => (s.key === editingKey ? updated : s)) : prev));
      toast.success('Setting updated');
      cancelEdit();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  const bustComposioCache = async () => {
    setBustingCache(true);
    try {
      await invalidateComposioCache();
      toast.success('Composio app catalog refreshed — newly configured apps will now appear');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to refresh cache');
    } finally {
      setBustingCache(false);
    }
  };

  const requiredSettings = (settings ?? []).filter((s) => s.is_required);
  const configuredCount = requiredSettings.filter((s) => s.value.trim() !== '').length;
  const allConfigured = requiredSettings.length > 0 && configuredCount === requiredSettings.length;

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-lg border bg-card px-5 py-4">
        <h2 className="text-xl font-semibold">Platform Settings</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          View and edit global platform configuration values. Changes take effect immediately.
        </p>
      </div>

      {!loading && !loadError && settings !== null && (
        <div
          className={`rounded-lg border px-5 py-3 flex items-center gap-3 ${
            allConfigured
              ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950'
              : 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950'
          }`}
        >
          {allConfigured ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
          )}
          <p
            className={`text-sm font-medium ${
              allConfigured
                ? 'text-green-800 dark:text-green-200'
                : 'text-yellow-800 dark:text-yellow-200'
            }`}
          >
            {allConfigured
              ? `All ${requiredSettings.length} required settings configured`
              : `${configuredCount} of ${requiredSettings.length} required settings configured — some are empty`}
          </p>
        </div>
      )}

      <div className="rounded-lg border bg-card px-5 py-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Composio app catalog</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            The list of available apps is cached for up to one hour. If you added a new auth config
            in the Composio dashboard and the app still shows as unavailable, refresh the cache to
            pick up the change immediately.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void bustComposioCache()}
          disabled={bustingCache}
          className="shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${bustingCache ? 'animate-spin' : ''}`} />
          {bustingCache ? 'Refreshing…' : 'Refresh app catalog'}
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Loading settings…
          </div>
        ) : loadError ? (
          <div className="px-5 py-6">
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-semibold">Failed to load settings</p>
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
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[220px]">Key</TableHead>
                <TableHead className="w-[260px]">Value</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[130px]">Required</TableHead>
                <TableHead className="w-[170px]">Last updated</TableHead>
                <TableHead className="w-[60px] text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(settings ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    No settings found.
                  </TableCell>
                </TableRow>
              ) : (
                (settings ?? []).map((setting) => {
                  const isEditing = editingKey === setting.key;
                  const hasValue = setting.value.trim() !== '';

                  return (
                    <TableRow key={setting.key}>
                      <TableCell>
                        <p className="text-sm font-mono font-medium">{setting.key}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {formatKey(setting.key)}
                        </p>
                      </TableCell>

                      <TableCell>
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-8 text-sm font-mono"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void saveEdit();
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              disabled={saving}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950 shrink-0"
                              onClick={() => void saveEdit()}
                              disabled={saving}
                              aria-label="Save"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 text-muted-foreground shrink-0"
                              onClick={cancelEdit}
                              disabled={saving}
                              aria-label="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <span
                            className={`text-sm font-mono ${
                              hasValue ? '' : 'text-muted-foreground italic'
                            }`}
                          >
                            {hasValue ? setting.value : '(empty)'}
                          </span>
                        )}
                      </TableCell>

                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {setting.description ?? '—'}
                        </span>
                      </TableCell>

                      <TableCell>
                        {setting.is_required ? (
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            >
                              Required
                            </Badge>
                            {hasValue ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {formatDate(setting.updated_at)}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center justify-end">
                          {!isEditing && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(setting)}
                              aria-label={`Edit ${setting.key}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
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
    </div>
  );
}
