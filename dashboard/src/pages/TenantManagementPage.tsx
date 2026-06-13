import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listAllTenants, createTenant } from '@/lib/gateway';
import { toSlug } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import type { AdminTenant } from '@/lib/types';

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'active' ? 'default' : 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {status}
    </Badge>
  );
}

export function TenantManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const showDeleted = searchParams.get('deleted') === 'true';

  const [orgs, setOrgs] = useState<AdminTenant[] | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    listAllTenants(showDeleted)
      .then(setOrgs)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => setLoading(false));
  }, [showDeleted]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDeleted = () => {
    setSearchParams(
      (prev) => {
        if (showDeleted) {
          prev.delete('deleted');
        } else {
          prev.set('deleted', 'true');
        }
        return prev;
      },
      { replace: true },
    );
  };

  const openDialog = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setFormError(null);
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setFormError(null);
    setSlugTouched(false);
  };

  const handleCreate = async () => {
    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();

    if (!trimmedName) {
      setFormError('Organization name is required.');
      return;
    }
    if (!trimmedSlug) {
      setFormError('URL slug is required.');
      return;
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(trimmedSlug)) {
      setFormError('Slug must be lowercase letters, numbers, and hyphens only (e.g. my-org).');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      await createTenant({ name: trimmedName, slug: trimmedSlug });
      toast.success(`Organization "${trimmedName}" created`);
      closeDialog();
      load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes('409') ||
        msg.toLowerCase().includes('conflict') ||
        msg.toLowerCase().includes('already')
      ) {
        setFormError('An organization with that URL already exists. Try a different slug.');
      } else {
        setFormError(msg || 'Failed to create organization. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-lg border bg-card px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Organizations</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Manage all organizations on the platform.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={toggleDeleted}>
            {showDeleted ? 'Hide deleted' : 'Show deleted'}
          </Button>
          <Button onClick={openDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            Create organization
          </Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Loading organizations…
          </div>
        ) : loadError ? (
          <div className="px-5 py-6">
            <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-semibold">Failed to load organizations</p>
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
        ) : (orgs ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base font-medium">
              {showDeleted ? 'No deleted organizations' : 'No organizations yet'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {showDeleted
                ? 'No organizations have been deleted.'
                : 'Create your first organization to get started.'}
            </p>
            {!showDeleted && (
              <Button className="mt-4" onClick={openDialog}>
                Create organization
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orgs ?? []).map((org) => (
                <TableRow key={org.id}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {org.slug}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={org.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(org.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create organization</DialogTitle>
            <DialogDescription>
              Add a new organization to the platform. Each organization gets its own employees and
              settings.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label htmlFor="org-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="org-name"
                placeholder="Acme Corp"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(toSlug(e.target.value));
                }}
                disabled={saving}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="org-slug" className="text-sm font-medium">
                URL slug
              </label>
              <Input
                id="org-slug"
                placeholder="acme-corp"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                }}
                disabled={saving}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
              />
              <p className="text-xs text-muted-foreground">
                Lowercase letters, numbers, and hyphens only.
              </p>
            </div>

            {formError && <p className="text-sm text-destructive">{formError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Cancel
            </Button>
            <Button disabled={saving} onClick={() => void handleCreate()}>
              {saving ? 'Creating…' : 'Create organization'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
