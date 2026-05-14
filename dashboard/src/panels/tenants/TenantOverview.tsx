import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { postgrestFetch } from '@/lib/postgrest';
import { listSecrets, setSecret } from '@/lib/gateway';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { formatRelativeTime } from '@/lib/utils';
import type { Tenant, TenantSecret } from '@/lib/types';

function SkeletonField() {
  return (
    <div className="flex items-center gap-4 py-2">
      <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      <div className="h-4 w-48 animate-pulse rounded bg-muted" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-8 w-20 animate-pulse rounded bg-muted" />
    </div>
  );
}

function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
      <p className="font-semibold">Failed to load</p>
      <p className="mt-1 text-destructive/80">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-destructive text-destructive hover:bg-destructive/10"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-4 py-2 text-sm">
      <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="break-all font-mono text-foreground">{value}</dd>
    </div>
  );
}

interface SecretRowProps {
  secret: TenantSecret;
  isEditing: boolean;
  secretValue: string;
  submitting: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onValueChange: (v: string) => void;
  onSubmit: () => void;
}

function SecretRow({
  secret,
  isEditing,
  secretValue,
  submitting,
  onEdit,
  onCancel,
  onValueChange,
  onSubmit,
}: SecretRowProps) {
  return (
    <li className="border-b last:border-0">
      <div className="flex items-center justify-between py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-foreground">{secret.key}</span>
          {secret.is_set ? (
            <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              ✓ Set
            </Badge>
          ) : (
            <Badge className="border-transparent bg-red-100 text-red-700 hover:bg-red-100">
              ✗ Not set
            </Badge>
          )}
        </div>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            Set value
          </Button>
        )}
      </div>

      {isEditing && (
        <div className="flex items-center gap-2 pb-3">
          <Input
            type="password"
            placeholder="Enter new value…"
            value={secretValue}
            onChange={(e) => onValueChange(e.target.value)}
            className="max-w-xs font-mono text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit();
              if (e.key === 'Escape') onCancel();
            }}
          />
          <Button size="sm" disabled={!secretValue || submitting} onClick={onSubmit}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
          <Button variant="ghost" size="sm" disabled={submitting} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </li>
  );
}

export function TenantOverview() {
  const { tenantId } = useTenant();

  const fetchTenant = useCallback(
    () => postgrestFetch<Tenant>('tenants', { id: `eq.${tenantId}` }),
    [tenantId],
  );
  const {
    data: tenants,
    error: tenantError,
    loading: tenantLoading,
    refresh: refreshTenant,
  } = usePoll(fetchTenant);
  const tenant = tenants?.[0] ?? null;

  const fetchSecrets = useCallback(() => listSecrets(tenantId), [tenantId]);
  const {
    data: secrets,
    error: secretsError,
    loading: secretsLoading,
    refresh: refreshSecrets,
  } = usePoll(fetchSecrets);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [secretValue, setSecretValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const openEditor = (key: string) => {
    setEditingKey(key);
    setSecretValue('');
  };

  const closeEditor = () => {
    setEditingKey(null);
    setSecretValue('');
  };

  const handleSubmit = async () => {
    if (!editingKey || !secretValue) return;
    setSubmitting(true);
    try {
      await setSecret(tenantId, editingKey, secretValue);
      toast.success(`Secret "${editingKey}" updated`);
      closeEditor();
      refreshSecrets();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to set secret');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Tenant</CardTitle>
            <CardDescription>Read-only tenant details</CardDescription>
          </CardHeader>
          <CardContent>
            {tenantLoading ? (
              <div>
                <SkeletonField />
                <SkeletonField />
                <SkeletonField />
                <SkeletonField />
              </div>
            ) : tenantError ? (
              <ErrorBox message={tenantError.message} onRetry={refreshTenant} />
            ) : !tenant ? (
              <p className="text-sm text-muted-foreground">Tenant not found.</p>
            ) : (
              <dl>
                <InfoRow label="Name" value={tenant.name} />
                <InfoRow label="Slug" value={tenant.slug} />
                <InfoRow label="Status" value={tenant.status} />
                <InfoRow label="ID" value={tenant.id} />
                <InfoRow label="Created" value={formatRelativeTime(tenant.created_at)} />
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Secrets</CardTitle>
            <CardDescription>
              API keys and credentials — values are never shown, only set status.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {secretsLoading ? (
              <ul>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </ul>
            ) : secretsError ? (
              <ErrorBox message={secretsError.message} onRetry={refreshSecrets} />
            ) : !secrets || secrets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No secrets configured for this tenant.
              </p>
            ) : (
              <ul>
                {secrets.map((secret) => (
                  <SecretRow
                    key={secret.key}
                    secret={secret}
                    isEditing={editingKey === secret.key}
                    secretValue={secretValue}
                    submitting={submitting}
                    onEdit={() => openEditor(secret.key)}
                    onCancel={closeEditor}
                    onValueChange={setSecretValue}
                    onSubmit={() => void handleSubmit()}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
