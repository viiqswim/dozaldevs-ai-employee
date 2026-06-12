import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { IntegrationCard } from '@/pages/composio/IntegrationCard';
import { cn } from '@/lib/utils';
import type { ComposioConnection, ComposioToolkit } from '@/lib/types';

export interface ConnectedAppsZoneProps {
  connections: ComposioConnection[];
  toolkits: ComposioToolkit[];
  onDisconnect: (slug: string) => void;
  isLoading: boolean;
  customConnectedCards?: ReactNode;
  customConnectedCount?: number;
}

export function ConnectedAppsZone({
  connections,
  toolkits,
  onDisconnect,
  isLoading,
  customConnectedCards,
  customConnectedCount = 0,
}: ConnectedAppsZoneProps) {
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const pendingToolkit = pendingSlug
    ? (toolkits.find((t) => t.slug === pendingSlug) ?? null)
    : null;

  function handleDisconnectClick(slug: string) {
    setPendingSlug(slug);
  }

  function handleConfirm() {
    if (pendingSlug) {
      onDisconnect(pendingSlug);
    }
    setPendingSlug(null);
  }

  function handleCancel() {
    setPendingSlug(null);
  }

  const connectedToolkits = toolkits.filter((t) => t.connected);

  return (
    <>
      <section className="rounded-lg border bg-card px-5 py-4">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Connected apps</h2>
          {!isLoading && connections.length + customConnectedCount > 0 && (
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5',
                'bg-primary/10 text-xs font-medium text-primary',
              )}
            >
              {connections.length + customConnectedCount}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="animate-pulse rounded-lg border bg-muted h-24" />
            <div className="animate-pulse rounded-lg border bg-muted h-24" />
          </div>
        ) : connectedToolkits.length === 0 && customConnectedCount === 0 ? (
          <p className="text-sm text-muted-foreground">Connect the tools you already use.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {connectedToolkits.map((toolkit) => (
              <IntegrationCard
                key={toolkit.slug}
                toolkit={toolkit}
                onConnect={() => Promise.resolve()}
                onDisconnect={handleDisconnectClick}
              />
            ))}
            {customConnectedCards}
          </div>
        )}
      </section>

      <Dialog open={pendingSlug !== null} onOpenChange={(open) => !open && handleCancel()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {pendingToolkit?.name ?? 'this app'}?</DialogTitle>
            <DialogDescription>
              This will stop {pendingToolkit?.name ?? 'this app'} from working with your account.
              Your existing data won&apos;t be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirm}>
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
