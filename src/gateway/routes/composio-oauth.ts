import { Router } from 'express';
import { Composio } from '@composio/core';
import { PrismaClient, TenantRole } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { ComposioConnectionRepository } from '../../repositories/composio-connection-repository.js';
import { COMPOSIO_API_KEY, DASHBOARD_BASE_URL } from '../../lib/config.js';

const COMPOSIO_DENIED_TOOLKITS = [
  'github',
  'stripe',
  'paypal',
  'plaid',
  'fly',
  'render',
  'aws',
  'gcp',
  'azure',
];

export interface ComposioOAuthRouteOptions {
  prisma?: PrismaClient;
  composio?: Pick<Composio, 'connectedAccounts' | 'authConfigs'>;
}

export function composioOAuthRoutes(opts: ComposioOAuthRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('composio-oauth');
  const prisma = opts.prisma ?? new PrismaClient();
  const connectionRepo = new ComposioConnectionRepository(prisma);

  router.get(
    '/admin/tenants/:tenantId/composio/connect',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }
      const { tenantId } = paramResult.data;

      const toolkit = req.query['toolkit'];
      if (!toolkit || typeof toolkit !== 'string') {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, 'toolkit query param is required');
        return;
      }

      if (COMPOSIO_DENIED_TOOLKITS.includes(toolkit.toLowerCase())) {
        sendError(res, 400, 'TOOLKIT_DENIED', 'Toolkit is not permitted');
        return;
      }

      const apiKey = COMPOSIO_API_KEY();
      if (!apiKey) {
        sendError(res, 503, 'Composio not configured');
        return;
      }

      try {
        const composio = opts.composio ?? new Composio({ apiKey });

        // Dynamically resolve the auth config ID for the requested toolkit.
        // This avoids hardcoding per-toolkit IDs and supports any future toolkit automatically.
        const authConfigs = await composio.authConfigs.list();
        const authConfig = authConfigs.items.find(
          (ac) => ac.toolkit?.slug?.toLowerCase() === toolkit.toLowerCase(),
        );
        if (!authConfig) {
          sendError(
            res,
            400,
            'TOOLKIT_NOT_CONFIGURED',
            `No auth config found for toolkit: ${toolkit}`,
          );
          return;
        }

        // Build the callback URL so Composio redirects back to our server after OAuth,
        // which lets the callback route write the connection to the DB.
        const callbackUrl = `${DASHBOARD_BASE_URL()}/admin/tenants/${tenantId}/composio/callback?toolkit=${encodeURIComponent(toolkit)}`;

        const connectionRequest = await composio.connectedAccounts.link(
          `tenant_${tenantId}`,
          authConfig.id,
          { allowMultiple: true, callbackUrl },
        );
        sendSuccess(res, 200, { url: connectionRequest.redirectUrl });
      } catch (err) {
        logger.error({ err, tenantId, toolkit }, 'Failed to create Composio connection link');
        sendError(res, 502, 'Failed to create Composio connection link');
      }
    },
  );

  router.get('/admin/tenants/:tenantId/composio/callback', async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_ID);
      return;
    }
    const { tenantId } = paramResult.data;

    const toolkit = req.query['toolkit'];
    if (!toolkit || typeof toolkit !== 'string') {
      sendError(res, 400, ERROR_CODES.INVALID_REQUEST, 'toolkit query param is required');
      return;
    }

    try {
      await connectionRepo.upsertConnection(tenantId, toolkit.toLowerCase());
      logger.info({ tenantId, toolkit }, 'Composio connection stored');
    } catch (err) {
      logger.error({ err, tenantId, toolkit }, 'Failed to store Composio connection');
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      return;
    }

    res.redirect(302, '/dashboard/integrations/composio');
  });

  return router;
}
