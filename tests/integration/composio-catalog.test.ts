import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { PrismaClient } from '@prisma/client';

const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const SERVICE_TOKEN = 'test-service-token-composio-catalog';
const URL = `/admin/tenants/${TENANT_ID}/composio/toolkits`;

// Repository has no injection seam in the route — mock the module, not the instance.
const { getActiveConnectionsMock } = vi.hoisted(() => ({
  getActiveConnectionsMock: vi.fn(),
}));

vi.mock('../../src/repositories/composio-connection-repository.js', () => ({
  ComposioConnectionRepository: vi.fn().mockImplementation(() => ({
    getActiveConnections: getActiveConnectionsMock,
  })),
}));

interface ComposioMock {
  toolkits: { get: ReturnType<typeof vi.fn> };
  authConfigs: { list: ReturnType<typeof vi.fn> };
}

interface ConnectionRow {
  toolkit: string;
  status?: string;
  connected_at?: string;
}

// Dynamic import (paired with vi.resetModules) gives each test fresh module-level
// pageCache/connectableCache, isolating the caching assertions in the SDK groups.
async function makeApp(opts: { composio: ComposioMock; connections?: ConnectionRow[] }) {
  const { composioCatalogRoutes } = await import('../../src/gateway/routes/composio-catalog.js');
  getActiveConnectionsMock.mockResolvedValue(opts.connections ?? []);

  const app = express();
  app.use(express.json());
  app.use(
    composioCatalogRoutes({
      composio: opts.composio as never,
      prisma: {} as unknown as PrismaClient,
    }),
  );
  return app;
}

function authed(app: express.Application, path: string) {
  return request(app).get(path).set('Authorization', `Bearer ${SERVICE_TOKEN}`);
}

interface RawItem {
  slug: string;
  name: string;
  meta: {
    logo: string | null;
    description: string | null;
    categories: { slug: string; name: string }[];
    toolsCount: number | null;
  };
  composioManagedAuthSchemes?: string[];
  noAuth?: boolean;
}

function rawItem(
  slug: string,
  extra: Partial<Pick<RawItem, 'composioManagedAuthSchemes' | 'noAuth'>> = {},
): RawItem {
  return {
    slug,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    meta: { logo: null, description: `${slug} description`, categories: [], toolsCount: 1 },
    ...extra,
  };
}

describe('GET /admin/tenants/:tenantId/composio/toolkits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.SERVICE_TOKEN = SERVICE_TOKEN;
    process.env.COMPOSIO_API_KEY = 'test-composio-api-key';
    getActiveConnectionsMock.mockResolvedValue([]);
  });

  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
  });

  it('returns 401 without an auth token', async () => {
    const composio: ComposioMock = {
      toolkits: { get: vi.fn() },
      authConfigs: { list: vi.fn() },
    };
    const app = await makeApp({ composio });
    const res = await request(app).get(URL);

    expect(res.status).toBe(401);
    expect(composio.toolkits.get).not.toHaveBeenCalled();
  });

  describe('connectable flag comes from authConfigs, not catalog flags', () => {
    it('marks only toolkits with an enabled auth config as connectable', async () => {
      const items = [
        rawItem('managedapp', { composioManagedAuthSchemes: ['OAUTH2'] }),
        rawItem('noauthapp', { noAuth: true }),
        rawItem('plainapp'),
      ];
      const composio: ComposioMock = {
        toolkits: { get: vi.fn().mockResolvedValue({ items, nextCursor: null }) },
        authConfigs: {
          list: vi.fn().mockResolvedValue({
            items: [{ id: 'ac_managed', toolkit: { slug: 'managedapp' } }],
          }),
        },
      };
      const app = await makeApp({ composio });

      const res = await authed(app, URL);
      expect(res.status).toBe(200);

      const bySlug = Object.fromEntries(
        (res.body.items as { slug: string; connectable: boolean }[]).map((i) => [i.slug, i]),
      );

      expect(bySlug['managedapp'].connectable).toBe(true);
      // noauthapp has a truthy noAuth catalog flag but is absent from authConfigs:
      // false here proves authConfigs is the source of truth, not the catalog flag.
      expect(bySlug['noauthapp'].connectable).toBe(false);
      expect(bySlug['plainapp'].connectable).toBe(false);
    });
  });

  describe('connected flag comes from tenant active connections', () => {
    it('marks a toolkit connected when the tenant has an active connection for it', async () => {
      const items = [rawItem('notion'), rawItem('gmail')];
      const composio: ComposioMock = {
        toolkits: { get: vi.fn().mockResolvedValue({ items, nextCursor: null }) },
        authConfigs: { list: vi.fn().mockResolvedValue({ items: [] }) },
      };
      const app = await makeApp({
        composio,
        connections: [
          { toolkit: 'notion', status: 'active', connected_at: '2026-01-01T00:00:00.000Z' },
        ],
      });

      const res = await authed(app, URL);
      expect(res.status).toBe(200);

      const bySlug = Object.fromEntries(
        (res.body.items as { slug: string; connected: boolean }[]).map((i) => [i.slug, i]),
      );

      expect(bySlug['notion'].connected).toBe(true);
      expect(bySlug['gmail'].connected).toBe(false);
    });
  });

  describe('pagination — nextCursor passthrough and cursor forwarding', () => {
    it('returns the SDK nextCursor and forwards ?cursor on the next request', async () => {
      const items = [rawItem('notion')];
      const composio: ComposioMock = {
        toolkits: { get: vi.fn().mockResolvedValue({ items, nextCursor: 'cursor-abc' }) },
        authConfigs: { list: vi.fn().mockResolvedValue({ items: [] }) },
      };
      const app = await makeApp({ composio });

      const first = await authed(app, URL);
      expect(first.status).toBe(200);
      expect(first.body.nextCursor).toBe('cursor-abc');

      const second = await authed(app, `${URL}?cursor=cursor-abc`);
      expect(second.status).toBe(200);

      expect(composio.toolkits.get).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: 'cursor-abc' }),
      );
      expect(composio.toolkits.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache hit — identical request does not re-invoke the SDK', () => {
    it('invokes toolkits.get exactly once for two identical requests', async () => {
      const items = [rawItem('notion')];
      const composio: ComposioMock = {
        toolkits: { get: vi.fn().mockResolvedValue({ items, nextCursor: null }) },
        authConfigs: { list: vi.fn().mockResolvedValue({ items: [] }) },
      };
      const app = await makeApp({ composio });

      const first = await authed(app, URL);
      const second = await authed(app, URL);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(composio.toolkits.get).toHaveBeenCalledTimes(1);
    });
  });

  describe('SDK rejection → structured 502', () => {
    it('returns 502 with a structured error code when toolkits.get throws', async () => {
      const composio: ComposioMock = {
        toolkits: { get: vi.fn().mockRejectedValue(new Error('Composio SDK unavailable')) },
        authConfigs: { list: vi.fn().mockResolvedValue({ items: [] }) },
      };
      const app = await makeApp({ composio });

      const res = await authed(app, URL);

      expect(res.status).toBe(502);
      expect(typeof res.body.error).toBe('string');
      expect(res.body.error).toBe('EXTERNAL_SERVICE_ERROR');
      expect(JSON.stringify(res.body)).not.toContain('Composio SDK unavailable');
    });
  });
});
