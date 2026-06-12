import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntegrationCard } from '../pages/composio/IntegrationCard';
import { SearchToolbar } from '../pages/composio/SearchToolbar';
import { ConnectedAppsZone } from '../pages/composio/ConnectedAppsZone';
import { EmptySearchState } from '../pages/composio/MarketplaceStates';
import { ComposioConnections } from '../pages/ComposioConnections';
import { listComposioToolkits } from '../lib/gateway';
import { usePoll } from '../hooks/use-poll';
import type { ComposioToolkit, ComposioConnection, ComposioToolkitsPage } from '../lib/types';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// vi.mock is hoisted file-wide; safe because only the page-level block below
// renders ComposioConnections (the sole caller of usePoll/useTenant).
vi.mock('../hooks/use-poll');
vi.mock('../hooks/use-tenant', () => ({
  useTenant: vi.fn().mockReturnValue({
    tenantId: 'test-tenant',
    tenants: [{ tenantId: 'test-tenant', slug: 'test' }],
  }),
}));

function makeToolkit(overrides: Partial<ComposioToolkit> = {}): ComposioToolkit {
  return {
    slug: 'notion',
    name: 'Notion',
    logo: 'https://example.com/notion.png',
    description: 'Notes app',
    categories: [],
    toolsCount: 5,
    connectable: false,
    connected: false,
    ...overrides,
  };
}

function makeConnection(overrides: Partial<ComposioConnection> = {}): ComposioConnection {
  return {
    toolkit: 'notion',
    status: 'active',
    connected_at: '2026-06-11T00:00:00.000Z',
    ...overrides,
  };
}

describe('IntegrationCard — button states', () => {
  test('connected → renders Connected text AND a Disconnect button', () => {
    render(
      <IntegrationCard
        toolkit={makeToolkit({ connected: true, connectable: true })}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );
    expect(screen.getByText(/connected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disconnect/i })).toBeInTheDocument();
    expect(screen.queryByText(/not yet available/i)).not.toBeInTheDocument();
  });

  test('connectable, not connected → renders a Connect button that calls onConnect', () => {
    const onConnect = vi.fn();
    render(
      <IntegrationCard
        toolkit={makeToolkit({ connectable: true, connected: false })}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
      />,
    );
    const connectButton = screen.getByRole('button', { name: /connect notion/i });
    expect(connectButton).toBeInTheDocument();
    expect(connectButton).not.toBeDisabled();
    fireEvent.click(connectButton);
    expect(onConnect).toHaveBeenCalledWith('notion');
  });

  test('not connectable, not connected → renders a disabled "Not yet available" control', () => {
    render(
      <IntegrationCard
        toolkit={makeToolkit({ connectable: false, connected: false })}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );
    expect(screen.getByText(/not yet available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /not yet available/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^connect/i })).not.toBeInTheDocument();
  });
});

describe('IntegrationCard — logo / letter-avatar fallback', () => {
  test('null logo → renders a letter avatar (first char), not a broken img', () => {
    render(
      <IntegrationCard
        toolkit={makeToolkit({ name: 'Notion', logo: null })}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('N')).toBeInTheDocument();
  });

  test('empty-string logo → falls back to a letter avatar', () => {
    render(
      <IntegrationCard
        toolkit={makeToolkit({ name: 'Gmail', logo: '' })}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('G')).toBeInTheDocument();
  });

  test('logo set → renders an <img> element', () => {
    render(
      <IntegrationCard
        toolkit={makeToolkit({ name: 'Notion', logo: 'https://example.com/notion.png' })}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
      />,
    );
    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/notion.png');
    expect(img).toHaveAttribute('alt', 'Notion logo');
  });
});

function FilterableGrid({ items, query }: { items: ComposioToolkit[]; query: string }) {
  const filtered = items.filter((t) => t.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div data-testid="grid">
      {filtered.map((t) => (
        <IntegrationCard key={t.slug} toolkit={t} onConnect={vi.fn()} onDisconnect={vi.fn()} />
      ))}
    </div>
  );
}

describe('Marketplace search filter', () => {
  const items = [
    makeToolkit({ slug: 'notion', name: 'Notion', connectable: true }),
    makeToolkit({ slug: 'gmail', name: 'Gmail', connectable: true }),
  ];

  test('typing in the search box fires the search-change handler', () => {
    const onSearchChange = vi.fn();
    render(
      <SearchToolbar
        search=""
        category=""
        categories={[]}
        onSearchChange={onSearchChange}
        onCategoryChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText(/search apps/i), { target: { value: 'noti' } });
    expect(onSearchChange).toHaveBeenCalledWith('noti');
  });

  test('an active query narrows visible cards to matches only, and clearing restores all', () => {
    const { rerender } = render(<FilterableGrid items={items} query="noti" />);
    const grid = screen.getByTestId('grid');
    expect(within(grid).getByText('Notion')).toBeInTheDocument();
    expect(within(grid).queryByText('Gmail')).not.toBeInTheDocument();

    rerender(<FilterableGrid items={items} query="" />);
    const restored = screen.getByTestId('grid');
    expect(within(restored).getByText('Notion')).toBeInTheDocument();
    expect(within(restored).getByText('Gmail')).toBeInTheDocument();
  });
});

describe('Marketplace category chip filter', () => {
  const categories = [
    { slug: 'productivity', name: 'Productivity' },
    { slug: 'email', name: 'Email' },
  ];

  test('renders an "All" chip plus one chip per category', () => {
    render(
      <SearchToolbar
        search=""
        category=""
        categories={categories}
        onSearchChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Productivity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email' })).toBeInTheDocument();
  });

  test('clicking a category chip fires the category-change handler', () => {
    const onCategoryChange = vi.fn();
    render(
      <SearchToolbar
        search=""
        category=""
        categories={categories}
        onSearchChange={vi.fn()}
        onCategoryChange={onCategoryChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Productivity' }));
    expect(onCategoryChange).toHaveBeenCalledWith('productivity');
  });

  test('the active category chip is marked aria-pressed', () => {
    render(
      <SearchToolbar
        search=""
        category="email"
        categories={categories}
        onSearchChange={vi.fn()}
        onCategoryChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Email' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'false');
  });
});

function MarketplaceZones({
  catalogItems,
  connections,
}: {
  catalogItems: ComposioToolkit[];
  connections: ComposioConnection[];
}) {
  const connectedSlugs = new Set(connections.map((c) => c.toolkit.toLowerCase()));
  const connectedApps = catalogItems.filter((t) => connectedSlugs.has(t.slug.toLowerCase()));
  const availableItems = catalogItems.filter(
    (t) => t.connectable && !connectedSlugs.has(t.slug.toLowerCase()),
  );
  return (
    <>
      <div data-testid="connected-zone">
        <ConnectedAppsZone
          connectedApps={connectedApps}
          onDisconnect={vi.fn()}
          isLoading={false}
          search=""
          category=""
          categories={[]}
          onSearchChange={vi.fn()}
          onCategoryChange={vi.fn()}
        />
      </div>
      <div data-testid="available-zone">
        {availableItems.map((t) => (
          <IntegrationCard key={t.slug} toolkit={t} onConnect={vi.fn()} onDisconnect={vi.fn()} />
        ))}
      </div>
    </>
  );
}

describe('Marketplace dedup', () => {
  test('a connected toolkit shows in the connected zone and NOT in the available zone', () => {
    const catalogItems = [
      makeToolkit({ slug: 'notion', name: 'Notion', connectable: true, connected: true }),
      makeToolkit({ slug: 'gmail', name: 'Gmail', connectable: true, connected: false }),
    ];
    const connections = [makeConnection({ toolkit: 'notion' })];

    render(<MarketplaceZones catalogItems={catalogItems} connections={connections} />);

    const connectedZone = screen.getByTestId('connected-zone');
    const availableZone = screen.getByTestId('available-zone');

    expect(within(connectedZone).getByText('Notion')).toBeInTheDocument();
    expect(within(availableZone).queryByText('Notion')).not.toBeInTheDocument();
    expect(within(availableZone).getByText('Gmail')).toBeInTheDocument();
  });
});

describe('EmptySearchState', () => {
  test('renders a no-match message (not a blank grid) and a clear action', () => {
    const onClear = vi.fn();
    render(<EmptySearchState query="zzzz" onClear={onClear} />);

    expect(screen.getByText(/no apps match/i)).toBeInTheDocument();
    expect(screen.getByText(/zzzz/)).toBeInTheDocument();

    const clearButton = screen.getByRole('button', { name: /clear search/i });
    expect(clearButton).toBeInTheDocument();
    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('listComposioToolkits', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  test('parses the paged response into { items, nextCursor }', async () => {
    const page: ComposioToolkitsPage = {
      items: [
        {
          slug: 'notion',
          name: 'Notion',
          logo: null,
          description: 'Notes',
          categories: [],
          toolsCount: 5,
          connectable: true,
          connected: false,
        },
      ],
      nextCursor: 'abc',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => page,
    } as Response);

    const result = await listComposioToolkits('tenant-id');

    expect(result).toEqual(page);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].slug).toBe('notion');
    expect(result.nextCursor).toBe('abc');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/admin/tenants/tenant-id/composio/toolkits');
  });

  test('forwards search and category query params', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], nextCursor: null }),
    } as Response);

    await listComposioToolkits('tenant-id', {
      search: 'noti',
      category: 'productivity',
      limit: 24,
    });

    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('search=noti');
    expect(calledUrl).toContain('category=productivity');
    expect(calledUrl).toContain('limit=24');
  });
});

describe('ComposioConnections — page-level tab tests', () => {
  const mockFetch = vi.fn();

  function setConnections(data: ComposioConnection[]) {
    vi.mocked(usePoll).mockReturnValue({
      data,
      error: null,
      loading: false,
      refresh: vi.fn(),
    } as ReturnType<typeof usePoll>);
  }

  function jsonPage(items: ComposioToolkit[]): Response {
    return { ok: true, json: async () => ({ items, nextCursor: null }) } as Response;
  }

  // listComposioToolkits is invoked twice: connectable-only (connectable=true) and
  // the paged catalog. Route each independently so connected metadata and the
  // browse catalog can be controlled per scenario.
  function routeToolkits(opts: { connectable?: ComposioToolkit[]; catalog?: ComposioToolkit[] }) {
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve(
        url.includes('connectable=true')
          ? jsonPage(opts.connectable ?? [])
          : jsonPage(opts.catalog ?? []),
      ),
    );
  }

  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn().mockImplementation(() => ({
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      })),
    );
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockResolvedValue(jsonPage([]));
    setConnections([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    mockFetch.mockReset();
  });

  function renderPage(initialUrl = '/integrations') {
    return render(
      <MemoryRouter initialEntries={[initialUrl]}>
        <ComposioConnections />
      </MemoryRouter>,
    );
  }

  test('Scenario A — connections present → Connected tab is active by default', async () => {
    setConnections([makeConnection({ toolkit: 'notion' })]);
    routeToolkits({
      connectable: [
        makeToolkit({ slug: 'notion', name: 'Notion', connectable: true, connected: true }),
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /connected apps/i })).toHaveAttribute(
        'data-state',
        'active',
      );
    });
    expect(screen.getByRole('tab', { name: /browse apps/i })).toHaveAttribute(
      'data-state',
      'inactive',
    );
  });

  test('Scenario B — no connections → Browse tab is active by default', async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /browse apps/i })).toHaveAttribute(
        'data-state',
        'active',
      );
    });
    expect(screen.getByRole('tab', { name: /connected apps/i })).toHaveAttribute(
      'data-state',
      'inactive',
    );
  });

  test('Scenario C — connected app stays visible when catalog page is empty', async () => {
    setConnections([makeConnection({ toolkit: 'notion' })]);
    routeToolkits({
      connectable: [
        makeToolkit({ slug: 'notion', name: 'Notion', connectable: true, connected: true }),
      ],
      catalog: [],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument();
    });
  });

  test('Scenario D — connectable and non-connectable apps both appear in Browse', async () => {
    routeToolkits({
      connectable: [makeToolkit({ slug: 'notion', name: 'Notion', connectable: true })],
      catalog: [makeToolkit({ slug: 'gmail', name: 'Gmail', connectable: false })],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /browse apps/i })).toHaveAttribute(
        'data-state',
        'active',
      );
    });
    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument();
      expect(screen.getByText('Gmail')).toBeInTheDocument();
    });
  });

  test('Scenario E — Connected empty state shows a single "Browse apps" CTA', async () => {
    renderPage('/integrations?tab=connected');

    await waitFor(() => {
      expect(screen.getByText(/you haven't connected any apps yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /browse apps/i })).toBeInTheDocument();
  });

  test('Scenario F — csearch filters the connected list', async () => {
    setConnections([makeConnection({ toolkit: 'notion' }), makeConnection({ toolkit: 'gmail' })]);
    routeToolkits({
      connectable: [
        makeToolkit({ slug: 'notion', name: 'Notion', connectable: true, connected: true }),
        makeToolkit({ slug: 'gmail', name: 'Gmail', connectable: true, connected: true }),
      ],
    });

    renderPage('/integrations?tab=connected&csearch=notion');

    await waitFor(() => {
      expect(screen.getByText('Notion')).toBeInTheDocument();
    });
    expect(screen.queryByText('Gmail')).not.toBeInTheDocument();
  });
});
