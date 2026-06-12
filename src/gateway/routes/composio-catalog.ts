import { Router } from 'express';
import { Composio } from '@composio/core';
import { PrismaClient, TenantRole } from '@prisma/client';
import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole, requirePermission } from '../middleware/authz.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { ComposioConnectionRepository } from '../../repositories/composio-connection-repository.js';
import { COMPOSIO_API_KEY } from '../../lib/config.js';
import { PERMISSIONS } from '../../lib/auth/permissions.js';

interface ComposioToolkitCategory {
  slug: string;
  name: string;
}

interface ComposioToolkit {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  categories: ComposioToolkitCategory[];
  toolsCount: number | null;
  connectable: boolean;
  connected: boolean;
}

interface ComposioToolkitsPage {
  items: ComposioToolkit[];
  nextCursor: string | null;
}

const CatalogQuerySchema = z.object({
  cursor: z.string().optional(),
  search: z.string().optional(),
  category: z.string().optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => {
      const n = v !== undefined ? parseInt(v, 10) : 24;
      if (isNaN(n) || n < 1) return 24;
      return Math.min(n, 50);
    }),
});

const ONE_HOUR_MS = 60 * 60 * 1000;

interface CachedConnectableSet {
  slugs: Set<string>;
  fetchedAt: number;
}

interface RawToolkitItem {
  slug: string;
  name: string;
  logo: string | null;
  description: string | null;
  categories: ComposioToolkitCategory[];
  toolsCount: number | null;
}

interface FullCatalogCache {
  items: RawToolkitItem[];
  fetchedAt: number;
}

let fullCatalogCache: FullCatalogCache | null = null;
let connectableCache: CachedConnectableSet | null = null;

function isExpired(fetchedAt: number): boolean {
  return Date.now() - fetchedAt > ONE_HOUR_MS;
}

async function getOrFetchAllToolkits(
  composio: Pick<Composio, 'toolkits' | 'authConfigs'>,
): Promise<RawToolkitItem[]> {
  if (fullCatalogCache && !isExpired(fullCatalogCache.fetchedAt)) {
    return fullCatalogCache.items;
  }

  type ToolkitsClient = { get: (p: Record<string, unknown>) => Promise<unknown> };
  const raw = await (composio.toolkits as unknown as ToolkitsClient).get({
    limit: 1000,
    sortBy: 'usage',
    managedBy: 'all',
  });

  const rawItems = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];

  const items: RawToolkitItem[] = rawItems.map((item) => {
    const meta = item['meta'] as Record<string, unknown> | undefined;
    return {
      slug: typeof item['slug'] === 'string' ? item['slug'] : '',
      name:
        typeof item['name'] === 'string'
          ? item['name']
          : typeof item['slug'] === 'string'
            ? item['slug']
            : '',
      logo: typeof meta?.['logo'] === 'string' ? meta['logo'] : null,
      description: typeof meta?.['description'] === 'string' ? meta['description'] : null,
      categories: Array.isArray(meta?.['categories'])
        ? (meta['categories'] as ComposioToolkitCategory[])
        : [],
      toolsCount: typeof meta?.['toolsCount'] === 'number' ? meta['toolsCount'] : null,
    };
  });

  fullCatalogCache = { items, fetchedAt: Date.now() };
  return items;
}

export interface ComposioCatalogRouteOptions {
  prisma?: PrismaClient;
  composio?: Pick<Composio, 'toolkits' | 'authConfigs'>;
}

export function composioCatalogRoutes(opts: ComposioCatalogRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('composio-catalog');
  const prisma = opts.prisma ?? new PrismaClient();
  const connectionRepo = new ComposioConnectionRepository(prisma);

  router.get(
    '/admin/tenants/:tenantId/composio/toolkits',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.MEMBER),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID, undefined, {
          issues: paramResult.error.issues,
        });
        return;
      }
      const { tenantId } = paramResult.data;

      const queryResult = CatalogQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: queryResult.error.issues,
        });
        return;
      }
      const { cursor, search, category, limit } = queryResult.data;

      const apiKey = COMPOSIO_API_KEY();
      if (!apiKey) {
        sendError(res, 503, 'COMPOSIO_NOT_CONFIGURED', 'Composio is not configured');
        return;
      }

      const composio =
        opts.composio ??
        (new Composio({ apiKey }) as unknown as Pick<Composio, 'toolkits' | 'authConfigs'>);

      let connectedSet: Set<string>;
      try {
        const connections = await connectionRepo.getActiveConnections(tenantId);
        connectedSet = new Set(connections.map((c) => c.toolkit.toLowerCase()));
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to fetch tenant Composio connections');
        connectedSet = new Set();
      }

      if (!connectableCache || isExpired(connectableCache.fetchedAt)) {
        try {
          const authConfigs = await composio.authConfigs.list();
          const slugs = new Set<string>();
          for (const ac of authConfigs.items) {
            const slug = ac.toolkit?.slug;
            if (slug) slugs.add(slug.toLowerCase());
          }
          connectableCache = { slugs, fetchedAt: Date.now() };
        } catch (err) {
          logger.warn({ err }, 'Failed to refresh Composio auth configs — using stale cache');
          if (!connectableCache) {
            connectableCache = { slugs: new Set(), fetchedAt: Date.now() };
          }
        }
      }
      const connectableSet = connectableCache.slugs;

      let allToolkits: RawToolkitItem[];
      try {
        allToolkits = await getOrFetchAllToolkits(composio);
      } catch (err) {
        logger.error({ err }, 'Failed to fetch Composio toolkit catalog');
        sendError(res, 502, 'EXTERNAL_SERVICE_ERROR', 'Failed to fetch app catalog');
        return;
      }

      let filtered = allToolkits;
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            (item.description ?? '').toLowerCase().includes(q),
        );
      }
      if (category) {
        filtered = filtered.filter((item) => item.categories.some((c) => c.slug === category));
      }

      const offset = cursor ? parseInt(cursor, 10) || 0 : 0;
      const pageItems = filtered.slice(offset, offset + limit);
      const nextOffset = offset + limit;
      const nextCursorOut = nextOffset < filtered.length ? String(nextOffset) : null;

      const items = pageItems.map((item) => ({
        ...item,
        connectable: connectableSet.has(item.slug.toLowerCase()),
        connected: connectedSet.has(item.slug.toLowerCase()),
      }));

      sendSuccess(res, 200, { items, nextCursor: nextCursorOut } as ComposioToolkitsPage);
    },
  );

  router.post(
    '/admin/composio/cache/invalidate',
    authMiddleware,
    requireAuth,
    requirePermission(PERMISSIONS.MANAGE_PLATFORM_SETTINGS),
    (_req, res) => {
      fullCatalogCache = null;
      connectableCache = null;
      logger.info('Composio catalog cache invalidated by platform owner');
      sendSuccess(res, 200, { invalidated: true });
    },
  );

  return router;
}
