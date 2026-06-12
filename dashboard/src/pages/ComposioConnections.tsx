import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { usePoll } from '@/hooks/use-poll';
import { useTenant } from '@/hooks/use-tenant';
import {
  listComposioConnections,
  listComposioToolkits,
  getComposioConnectUrl,
  disconnectComposioApp,
} from '@/lib/gateway';
import type { ComposioToolkit } from '@/lib/types';
import { ConnectedAppsZone } from './composio/ConnectedAppsZone';
import { IntegrationCard } from './composio/IntegrationCard';
import { SearchToolbar } from './composio/SearchToolbar';
import {
  SkeletonGrid,
  EmptySearchState,
  CatalogErrorState,
  showPopupBlockedToast,
} from './composio/MarketplaceStates';

export function ComposioConnections() {
  const { tenantId } = useTenant();
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';

  const fetchConnections = useCallback(() => listComposioConnections(tenantId), [tenantId]);
  const {
    data: connections,
    loading: connectionsLoading,
    refresh: refreshConnections,
  } = usePoll(fetchConnections);

  const [catalogItems, setCatalogItems] = useState<ComposioToolkit[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<Error | null>(null);
  const [allCategories, setAllCategories] = useState<{ slug: string; name: string }[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [connectableItems, setConnectableItems] = useState<ComposioToolkit[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadCatalog = useCallback(
    (q: string, cat: string) => {
      setCatalogLoading(true);
      setCatalogError(null);
      setNextCursor(null);
      listComposioToolkits(tenantId, {
        limit: 24,
        search: q || undefined,
        category: cat || undefined,
      })
        .then((page) => {
          setCatalogItems(page.items);
          setNextCursor(page.nextCursor);
          if (!q && !cat) {
            const catMap = new Map<string, string>();
            for (const item of page.items) {
              for (const c of item.categories) catMap.set(c.slug, c.name);
            }
            setAllCategories(Array.from(catMap.entries()).map(([slug, name]) => ({ slug, name })));
          }
        })
        .catch((err: unknown) => {
          setCatalogError(err instanceof Error ? err : new Error(String(err)));
        })
        .finally(() => setCatalogLoading(false));
    },
    [tenantId],
  );

  useEffect(() => {
    listComposioToolkits(tenantId, { connectable: true, limit: 200 })
      .then((page) => setConnectableItems(page.items))
      .catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    setNextCursor(null);
  }, [search, category]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => loadCatalog(search, category), search ? 300 : 0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loadCatalog, search, category]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    listComposioToolkits(tenantId, {
      cursor: nextCursor,
      limit: 24,
      search: search || undefined,
      category: category || undefined,
    })
      .then((page) => {
        setCatalogItems((prev) => [...prev, ...page.items]);
        setNextCursor(page.nextCursor);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [nextCursor, loadingMore, tenantId, search, category]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  const connectedSlugs = new Set((connections ?? []).map((c) => c.toolkit.toLowerCase()));

  const availableItems = connectableItems.filter((t) => !connectedSlugs.has(t.slug.toLowerCase()));

  const browseItems = catalogItems.filter((t) => !connectedSlugs.has(t.slug.toLowerCase()));

  const isZone1Loading = connectionsLoading || (catalogLoading && catalogItems.length === 0);

  function updateSearch(value: string) {
    setSearchParams(
      (prev) => {
        if (value) prev.set('search', value);
        else prev.delete('search');
        return prev;
      },
      { replace: true },
    );
  }

  function updateCategory(value: string) {
    setSearchParams(
      (prev) => {
        if (value) prev.set('category', value);
        else prev.delete('category');
        return prev;
      },
      { replace: true },
    );
  }

  async function handleConnect(slug: string) {
    try {
      const { url } = await getComposioConnectUrl(tenantId, slug);
      const popup = window.open(url, '_blank');
      if (!popup) showPopupBlockedToast();
    } catch (err) {
      toast.error('Could not start the connection. Please try again.');
    }
  }

  async function handleDisconnect(slug: string) {
    try {
      await disconnectComposioApp(tenantId, slug);
      toast.success('App disconnected.');
      refreshConnections();
      listComposioToolkits(tenantId, { connectable: true, limit: 200 })
        .then((page) => setConnectableItems(page.items))
        .catch(() => {});
      loadCatalog(search, category);
    } catch (err) {
      toast.error('Could not disconnect. Please try again.');
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="rounded-lg border bg-card px-5 py-4">
        <h1 className="text-lg font-semibold text-foreground">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect the tools your team already uses to unlock powerful automations.
        </p>
      </div>

      <ConnectedAppsZone
        connections={connections ?? []}
        toolkits={catalogItems}
        onDisconnect={(slug) => void handleDisconnect(slug)}
        isLoading={isZone1Loading}
      />

      <div className="rounded-lg border bg-card px-5 py-4 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Available to connect now</h2>
        {availableItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            More apps are coming soon — browse the full list below.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {availableItems.map((toolkit) => (
              <IntegrationCard
                key={toolkit.slug}
                toolkit={toolkit}
                onConnect={handleConnect}
                onDisconnect={(slug) => void handleDisconnect(slug)}
              />
            ))}
          </div>
        )}
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Browse all apps</h2>
        <SearchToolbar
          search={search}
          category={category}
          categories={allCategories}
          onSearchChange={updateSearch}
          onCategoryChange={updateCategory}
        />
        <div className="rounded-lg border bg-card px-5 py-4">
          <div aria-live="polite" aria-atomic="false">
            {catalogLoading ? (
              <SkeletonGrid count={6} />
            ) : catalogError ? (
              <CatalogErrorState onRetry={() => loadCatalog(search, category)} />
            ) : browseItems.length === 0 && search ? (
              <EmptySearchState query={search} onClear={() => updateSearch('')} />
            ) : browseItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                All available apps are already connected.
              </p>
            ) : (
              <>
                <div
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                  style={{ contentVisibility: 'auto' }}
                >
                  {browseItems.map((toolkit) => (
                    <IntegrationCard
                      key={toolkit.slug}
                      toolkit={toolkit}
                      onConnect={handleConnect}
                      onDisconnect={(slug) => void handleDisconnect(slug)}
                    />
                  ))}
                </div>
                <div ref={sentinelRef} className="h-4" aria-hidden="true" />
                {loadingMore && (
                  <p className="py-4 text-center text-sm text-muted-foreground" aria-live="polite">
                    Loading more…
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
