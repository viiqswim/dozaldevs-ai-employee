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
import { SearchToolbar } from '@/pages/composio/SearchToolbar';
import { cn } from '@/lib/utils';
import type { ComposioToolkit } from '@/lib/types';

export interface ConnectedAppsZoneProps {
  connectedApps: ComposioToolkit[];
  onDisconnect: (slug: string) => void;
  isLoading: boolean;
  customConnectedCards?: ReactNode;
  customConnectedCount?: number;
  search: string;
  category: string;
  categories: { slug: string; name: string }[];
  onSearchChange: (v: string) => void;
  onCategoryChange: (v: string) => void;
  onBrowse?: () => void;
}

export function ConnectedAppsZone({
  connectedApps,
  onDisconnect,
  isLoading,
  customConnectedCards,
  customConnectedCount = 0,
  search,
  category,
  categories,
  onSearchChange,
  onCategoryChange,
  onBrowse,
}: ConnectedAppsZoneProps) {
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  const pendingToolkit = pendingSlug
    ? (connectedApps.find((t) => t.slug === pendingSlug) ?? null)
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

  return (
    <>
      <section className="rounded-lg border bg-card px-5 py-4">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-foreground">Connected apps</h2>
          {!isLoading && connectedApps.length + customConnectedCount > 0 && (
            <span
              className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5',
                'bg-primary/10 text-xs font-medium text-primary',
              )}
            >
              {connectedApps.length + customConnectedCount}
            </span>
          )}
        </div>

        <SearchToolbar
          search={search}
          category={category}
          categories={categories}
          onSearchChange={onSearchChange}
          onCategoryChange={onCategoryChange}
        />

        <div className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="animate-pulse rounded-lg border bg-muted h-24" />
              <div className="animate-pulse rounded-lg border bg-muted h-24" />
            </div>
          ) : connectedApps.length === 0 && customConnectedCount === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm font-medium text-foreground">
                You haven&apos;t connected any apps yet
              </p>
              <p className="text-sm text-muted-foreground">
                Connect the tools you already use so your AI employees can work with them.
              </p>
              {onBrowse && <Button onClick={onBrowse}>Browse apps</Button>}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {connectedApps.map((toolkit) => (
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
        </div>
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
