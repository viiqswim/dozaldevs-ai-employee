import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ErrorBox } from '@/components/ui/error-box';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import { formatRelativeTime } from '@/lib/utils';
import {
  listComposioConnections,
  getComposioConnectUrl,
  disconnectComposioApp,
} from '@/lib/gateway';
import type { ComposioConnection } from '@/lib/types';

const TOOLKIT_OPTIONS = [{ value: 'notion', label: 'Notion' }];

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

interface ConnectionRowProps {
  connection: ComposioConnection;
  disconnecting: boolean;
  onDisconnect: (toolkit: string) => void;
}

function ConnectionRow({ connection, disconnecting, onDisconnect }: ConnectionRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-0">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{capitalize(connection.toolkit)}</p>
        <p className="text-xs text-muted-foreground">
          Connected {formatRelativeTime(connection.connected_at)}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge className="border-transparent bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
          ✓ Connected
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={disconnecting}
          onClick={() => onDisconnect(connection.toolkit)}
        >
          Disconnect
        </Button>
      </div>
    </div>
  );
}

export function ComposioConnections() {
  const { tenantId } = useTenant();
  const [selectedToolkit, setSelectedToolkit] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [pendingMessage, setPendingMessage] = useState(false);
  const [disconnectingToolkit, setDisconnectingToolkit] = useState<string | null>(null);

  const fetchConnections = useCallback(() => listComposioConnections(tenantId), [tenantId]);

  const { data: connections, error, loading, refresh } = usePoll(fetchConnections);

  async function handleConnect() {
    if (!selectedToolkit) return;
    setConnecting(true);
    setPendingMessage(false);
    try {
      const { url } = await getComposioConnectUrl(tenantId, selectedToolkit);
      window.open(url, '_blank', 'noopener,noreferrer');
      setPendingMessage(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Failed to start connection. Please try again.',
      );
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect(toolkit: string) {
    const confirmed = window.confirm(
      `Disconnect ${capitalize(toolkit)}? AI employees in this organization will lose access to it.`,
    );
    if (!confirmed) return;
    setDisconnectingToolkit(toolkit);
    disconnectComposioApp(tenantId, toolkit)
      .then(() => {
        toast.success(`${capitalize(toolkit)} disconnected`);
        refresh();
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : 'Failed to disconnect. Please try again.');
      })
      .finally(() => {
        setDisconnectingToolkit(null);
      });
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Connected apps</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect third-party apps so your AI employees can access them during their work.
        </p>
      </div>

      <div className="rounded-lg border bg-card px-5 py-4">
        <h2 className="text-sm font-medium mb-3">Your connected apps</h2>

        {loading ? (
          <div className="space-y-3 py-2">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
          </div>
        ) : error ? (
          <ErrorBox message={error.message} onRetry={refresh} />
        ) : !connections || connections.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No apps connected yet. Connect your first app below.
          </p>
        ) : (
          <div>
            {connections.map((conn) => (
              <ConnectionRow
                key={conn.toolkit}
                connection={conn}
                disconnecting={disconnectingToolkit === conn.toolkit}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
        <div>
          <h2 className="text-sm font-medium">Connect an app</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose an app and click Connect. A new tab will open where you can sign in and grant
            access.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <SearchableSelect
            options={TOOLKIT_OPTIONS}
            value={selectedToolkit}
            onValueChange={setSelectedToolkit}
            placeholder="Choose an app"
            searchPlaceholder="Search apps..."
            className="w-48"
            disabled={connecting}
          />
          <Button disabled={!selectedToolkit || connecting} onClick={() => void handleConnect()}>
            {connecting ? 'Opening…' : 'Connect'}
          </Button>
        </div>

        {pendingMessage && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              A new tab has opened. Complete the connection in your browser, then refresh this page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
