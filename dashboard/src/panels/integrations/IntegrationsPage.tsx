import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { postgrestFetch } from '@/lib/postgrest';
import { GATEWAY_URL } from '@/lib/constants';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { formatRelativeTime } from '@/lib/utils';
import {
  fetchAvailableInstallations,
  linkGitHubInstallation,
  disconnectGitHub,
} from '@/lib/gateway';
import type { Tenant, TenantIntegration, GitHubInstallation } from '@/lib/types';

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

interface IntegrationRowProps {
  name: string;
  description: string;
  integration: TenantIntegration | null;
  connectHref?: string;
  connectLabel?: string;
}

function IntegrationRow({
  name,
  description,
  integration,
  connectHref,
  connectLabel = 'Connect',
}: IntegrationRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card px-5 py-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {integration && (
          <p className="text-xs text-muted-foreground">
            {integration.external_id ? `Connected · ${integration.external_id}` : 'Connected'} ·{' '}
            {formatRelativeTime(integration.created_at)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {integration ? (
          <>
            <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              ✓ Connected
            </Badge>
            {connectHref && (
              <a
                href={connectHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
              >
                Reconnect
              </a>
            )}
          </>
        ) : (
          <a
            href={connectHref ?? '#'}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!connectHref}
            className={
              connectHref
                ? 'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent'
                : 'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium opacity-40 pointer-events-none'
            }
          >
            {connectLabel}
          </a>
        )}
      </div>
    </div>
  );
}

interface GitHubIntegrationRowProps {
  integration: TenantIntegration | null;
  tenantId: string;
  connectHref?: string;
  onRefresh: () => void;
}

function GitHubIntegrationRow({
  integration,
  tenantId,
  connectHref,
  onRefresh,
}: GitHubIntegrationRowProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [installations, setInstallations] = useState<GitHubInstallation[]>([]);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (integration) return;
    fetchAvailableInstallations(tenantId)
      .then((res) => setInstallations(res.installations))
      .catch(() => setInstallations([]));
  }, [tenantId, integration]);

  async function handleDisconnect() {
    const confirmed = window.confirm(
      "Disconnect GitHub from this organization? Other organizations using the same GitHub account won't be affected.",
    );
    if (!confirmed) return;
    setDisconnecting(true);
    try {
      await disconnectGitHub(tenantId);
      onRefresh();
    } catch (err) {
      console.error('Failed to disconnect GitHub:', err);
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleLink(id: number) {
    setLinking(true);
    try {
      await linkGitHubInstallation(tenantId, String(id));
      onRefresh();
    } catch (err) {
      console.error('Failed to link GitHub installation:', err);
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border bg-card px-5 py-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">GitHub</p>
        <p className="text-xs text-muted-foreground">
          Connect GitHub to let AI employees access your repositories
        </p>
        {integration && (
          <p className="text-xs text-muted-foreground">
            {integration.external_id ? `Connected · ${integration.external_id}` : 'Connected'} ·{' '}
            {formatRelativeTime(integration.created_at)}
          </p>
        )}
        {!integration && installations.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">Or link an existing GitHub connection:</p>
            <div className="mt-1 space-y-1">
              {installations.map((inst) => (
                <div key={inst.id} className="flex items-center gap-2">
                  <span className="text-xs">{inst.account.login}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={linking}
                    onClick={() => handleLink(inst.id)}
                  >
                    Link
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {integration ? (
          <>
            <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
              ✓ Connected
            </Badge>
            {connectHref && (
              <a
                href={connectHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
              >
                Reconnect
              </a>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              disabled={disconnecting}
              onClick={handleDisconnect}
            >
              Disconnect
            </Button>
          </>
        ) : (
          <a
            href={connectHref ?? '#'}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!connectHref}
            className={
              connectHref
                ? 'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent'
                : 'inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium opacity-40 pointer-events-none'
            }
          >
            Connect GitHub
          </a>
        )}
      </div>
    </div>
  );
}

export function IntegrationsPage() {
  const { tenantId } = useTenant();

  const fetchIntegrations = useCallback(
    () =>
      postgrestFetch<TenantIntegration>('tenant_integrations', {
        tenant_id: `eq.${tenantId}`,
        deleted_at: 'is.null',
      }),
    [tenantId],
  );
  const {
    data: integrations,
    error: integrationsError,
    loading: integrationsLoading,
    refresh: refreshIntegrations,
  } = usePoll(fetchIntegrations);

  const fetchTenant = useCallback(
    () => postgrestFetch<Tenant>('tenants', { id: `eq.${tenantId}` }),
    [tenantId],
  );
  const { data: tenants } = usePoll(fetchTenant);
  const tenant = tenants?.[0] ?? null;

  return (
    <div className="p-6">
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Integrations</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage external service connections for this organization.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Integrations</CardTitle>
            <CardDescription>External service connections for this tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            {integrationsLoading ? (
              <div className="space-y-4">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : integrationsError ? (
              <ErrorBox message={integrationsError.message} onRetry={refreshIntegrations} />
            ) : (
              <div className="space-y-4">
                <IntegrationRow
                  name="Slack"
                  description="Post messages and receive approvals in Slack channels."
                  integration={integrations?.find((i) => i.provider === 'slack') ?? null}
                  connectHref={`${GATEWAY_URL}/slack/install?tenant=${tenantId}`}
                />
                <IntegrationRow
                  name="Jira"
                  description="Receive Jira issue events to trigger AI employees."
                  integration={integrations?.find((i) => i.provider === 'jira') ?? null}
                  connectHref={
                    tenant?.slug
                      ? `${GATEWAY_URL}/integrations/jira/install?tenant=${tenant.slug}`
                      : undefined
                  }
                  connectLabel="Connect Jira"
                />
                <IntegrationRow
                  name="Notion"
                  description="Read Notion pages to give AI employees access to your knowledge base and schedules."
                  integration={integrations?.find((i) => i.provider === 'notion') ?? null}
                  connectHref={
                    tenant?.slug
                      ? `${GATEWAY_URL}/integrations/notion/install?tenant=${tenant.slug}`
                      : undefined
                  }
                  connectLabel="Connect Notion"
                />
                <GitHubIntegrationRow
                  integration={integrations?.find((i) => i.provider === 'github') ?? null}
                  tenantId={tenantId}
                  connectHref={
                    tenant?.slug
                      ? `${GATEWAY_URL}/integrations/github/install?tenant=${tenant.slug}`
                      : undefined
                  }
                  onRefresh={refreshIntegrations}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
