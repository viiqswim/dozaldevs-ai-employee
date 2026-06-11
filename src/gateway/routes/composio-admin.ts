import { Router } from 'express';
import { PrismaClient, TenantRole } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantIdParamSchema, ComposioToolkitParamSchema } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { ComposioConnectionRepository } from '../../repositories/composio-connection-repository.js';

export interface ComposioAdminRouteOptions {
  prisma?: PrismaClient;
}

interface UsageRow {
  toolkit: string;
  date: string;
  count: number;
}

export function composioAdminRoutes(opts: ComposioAdminRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('composio-admin');
  const prisma = opts.prisma ?? new PrismaClient();
  const connectionRepo = new ComposioConnectionRepository(prisma);

  router.get(
    '/admin/tenants/:tenantId/composio/connections',
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

      try {
        const connections = await connectionRepo.getActiveConnections(tenantId);
        sendSuccess(
          res,
          200,
          connections.map((c) => ({
            toolkit: c.toolkit,
            status: c.status,
            connected_at: c.connected_at,
          })),
        );
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to list Composio connections');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/composio/connections/:toolkit',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = ComposioToolkitParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID, undefined, {
          issues: paramResult.error.issues,
        });
        return;
      }
      const { tenantId, toolkit } = paramResult.data;

      try {
        await connectionRepo.softDeleteConnection(tenantId, toolkit.toLowerCase());
        sendSuccess(res, 204);
      } catch (err) {
        logger.error({ err, tenantId, toolkit }, 'Failed to disconnect Composio connection');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  router.get(
    '/admin/tenants/:tenantId/composio/usage',
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

      try {
        const calls = await prisma.taskComposioCall.findMany({
          where: { tenant_id: tenantId },
          orderBy: { called_at: 'desc' },
        });

        const counts = new Map<string, UsageRow>();
        for (const call of calls) {
          const date = call.called_at.toISOString().slice(0, 10);
          const key = `${call.toolkit}|${date}`;
          const existing = counts.get(key);
          if (existing) {
            existing.count += 1;
          } else {
            counts.set(key, { toolkit: call.toolkit, date, count: 1 });
          }
        }

        sendSuccess(res, 200, Array.from(counts.values()));
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to fetch Composio usage');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  return router;
}
