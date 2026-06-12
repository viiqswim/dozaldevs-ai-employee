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
  listSecrets,
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
import { CUSTOM_CREDENTIAL_APPS, CustomCredentialCard } from './composio/CustomCredentialCard';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

export function ComposioConnections() {
  const { tenantId, tenants } = useTenant();
  const tenantSlug = tenants.find((t) => t.tenantId === tenantId)?.slug ?? '';
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') ?? '';
  const category = searchParams.get('category') ?? '';
  const connectedSearch = searchParams.get('csearch') ?? '';
  const connectedCategory = searchParams.get('ccategory') ?? '';

  const fetchConnections = useCallback(() => listComposioConnections(tenantId), [tenantId]);
  const {
    data: connections,
    loading: connectionsLoading,
    refresh: refreshConnections,
  } = usePoll(fetchConnections);

  const [existingSecretKeys, setExistingSecretKeys] = useState<Set<string>>(new Set());

  const refreshSecrets = useCallback(() => {
    listSecrets(tenantId)
      .then((list) => setExistingSecretKeys(new Set(list.map((s) => s.key))))
      .catch(() => {});
  }, [tenantId]);

  useEffect(() => {
    refreshSecrets();
  }, [refreshSecrets]);

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

  const connectedSlugs = new Set((connections ?? []).map((c) => c.toolkit.toLowerCase()));

  const connectedComposioApps: ComposioToolkit[] = (connections ?? []).map((conn) => {
    const slug = conn.toolkit.toLowerCase();
    return (
      connectableItems.find((t) => t.slug.toLowerCase() === slug) ??
      catalogItems.find((t) => t.slug.toLowerCase() === slug) ?? {
        slug: conn.toolkit,
        name: conn.toolkit,
        logo: '',
        description: null,
        categories: [],
        toolsCount: null,
        connectable: false,
        connected: true,
      }
    );
  });

  const connectedCategoryMap = new Map<string, string>();
  for (const app of connectedComposioApps) {
    for (const c of app.categories) {
      connectedCategoryMap.set(c.slug, c.name);
    }
  }
  const connectedCategories =
    connectedCategoryMap.size >= 2
      ? Array.from(connectedCategoryMap.entries()).map(([slug, name]) => ({ slug, name }))
      : [];

  function isCustomAppConnected(app: (typeof CUSTOM_CREDENTIAL_APPS)[number]): boolean {
    if (app.connectType === 'oauth-redirect') {
      return app.statusKey !== undefined && existingSecretKeys.has(app.statusKey);
    }
    return app.fields.every((f) => existingSecretKeys.has(f.key));
  }

  const connectedCustomApps = CUSTOM_CREDENTIAL_APPS.filter(isCustomAppConnected);
  const connectedCount = connectedComposioApps.length + connectedCustomApps.length;

  const smartDefault = !connectionsLoading && connectedCount > 0 ? 'connected' : 'browse';
  const activeTab = searchParams.get('tab') ?? smartDefault;

  const loadMore = useCallback(() => {
    if (activeTab !== 'browse') return;
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
  }, [activeTab, nextCursor, loadingMore, tenantId, search, category]);

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

  const availableItems = connectableItems.filter((t) => !connectedSlugs.has(t.slug.toLowerCase()));

  const filteredAvailableItems = availableItems.filter((t) => {
    const matchesSearch =
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !category || t.categories.some((c) => c.slug === category);
    return matchesSearch && matchesCategory;
  });

  const availableSlugs = new Set(availableItems.map((t) => t.slug.toLowerCase()));
  const browseItems = catalogItems.filter(
    (t) => !connectedSlugs.has(t.slug.toLowerCase()) && !availableSlugs.has(t.slug.toLowerCase()),
  );

  const filteredConnectedApps = connectedComposioApps.filter((app) => {
    const matchesSearch =
      !connectedSearch ||
      app.name.toLowerCase().includes(connectedSearch.toLowerCase()) ||
      app.slug.toLowerCase().includes(connectedSearch.toLowerCase());
    const matchesCategory =
      !connectedCategory || app.categories.some((c) => c.slug === connectedCategory);
    return matchesSearch && matchesCategory;
  });

  const availableCustomApps = CUSTOM_CREDENTIAL_APPS.filter((app) => !isCustomAppConnected(app));
  const isZone1Loading = connectionsLoading || (catalogLoading && catalogItems.length === 0);

  function updateSearch(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('search', value);
    else next.delete('search');
    setSearchParams(next, { replace: true });
  }

  function updateCategory(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('category', value);
    else next.delete('category');
    setSearchParams(next, { replace: true });
  }

  function updateTab(value: string) {
    const next = new URLSearchParams(searchParams);
    const currentSmartDefault = !connectionsLoading && connectedCount > 0 ? 'connected' : 'browse';
    if (value === currentSmartDefault) {
      next.delete('tab');
    } else {
      next.set('tab', value);
    }
    setSearchParams(next, { replace: true });
  }

  function updateConnectedSearch(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('csearch', value);
    else next.delete('csearch');
    setSearchParams(next, { replace: true });
  }

  function updateConnectedCategory(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('ccategory', value);
    else next.delete('ccategory');
    setSearchParams(next, { replace: true });
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

      {connectionsLoading && !searchParams.has('tab') ? (
        <SkeletonGrid count={3} />
      ) : (
        <Tabs value={activeTab} onValueChange={updateTab}>
          <TabsList className="w-full flex-wrap h-auto gap-y-1">
            <TabsTrigger value="connected">
              Connected apps
              {!connectionsLoading && connectedCount > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 bg-primary/10 text-xs font-medium text-primary">
                  {connectedCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="browse">Browse apps</TabsTrigger>
          </TabsList>

          <TabsContent value="connected">
            <ConnectedAppsZone
              connectedApps={filteredConnectedApps}
              onDisconnect={(slug) => void handleDisconnect(slug)}
              isLoading={isZone1Loading}
              customConnectedCount={connectedCustomApps.length}
              customConnectedCards={connectedCustomApps.map((app) => (
                <CustomCredentialCard
                  key={app.id}
                  app={app}
                  tenantId={tenantId}
                  tenantSlug={tenantSlug}
                  isConnected={true}
                  onUpdated={refreshSecrets}
                />
              ))}
              search={connectedSearch}
              category={connectedCategory}
              categories={connectedCategories}
              onSearchChange={updateConnectedSearch}
              onCategoryChange={updateConnectedCategory}
              onBrowse={() => updateTab('browse')}
            />
          </TabsContent>

          <TabsContent value="browse">
            <div className="space-y-4">
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
                  ) : availableCustomApps.length === 0 &&
                    filteredAvailableItems.length === 0 &&
                    browseItems.length === 0 &&
                    search ? (
                    <EmptySearchState query={search} onClear={() => updateSearch('')} />
                  ) : availableCustomApps.length === 0 &&
                    filteredAvailableItems.length === 0 &&
                    browseItems.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      All available apps are already connected.
                    </p>
                  ) : (
                    <>
                      <div
                        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                        style={{ contentVisibility: 'auto' }}
                      >
                        {availableCustomApps.map((app) => (
                          <CustomCredentialCard
                            key={app.id}
                            app={app}
                            tenantId={tenantId}
                            tenantSlug={tenantSlug}
                            isConnected={false}
                            onUpdated={refreshSecrets}
                          />
                        ))}
                        {filteredAvailableItems.map((toolkit) => (
                          <IntegrationCard
                            key={toolkit.slug}
                            toolkit={toolkit}
                            onConnect={handleConnect}
                            onDisconnect={(slug) => void handleDisconnect(slug)}
                          />
                        ))}
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
                        <p
                          className="py-4 text-center text-sm text-muted-foreground"
                          aria-live="polite"
                        >
                          Loading more…
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
