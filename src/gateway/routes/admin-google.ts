import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantSecretRepository } from '../../repositories/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { clearTokenCache } from '../services/google-token-manager.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { sendError } from '../lib/http-response.js';

export interface AdminGoogleRouteOptions {
  prisma?: PrismaClient;
}

export function adminGoogleRoutes(opts: AdminGoogleRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('admin-google');
  const prisma = opts.prisma ?? new PrismaClient();
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.delete(
    '/admin/tenants/:tenantId/integrations/google',
    requireAdminKey,
    async (req, res) => {
      const parsed = TenantIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        sendError(res, 400, 'Invalid tenantId');
        return;
      }
      const { tenantId } = parsed.data;

      try {
        await integrationRepo.delete(tenantId, 'google');
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to delete Google integration record');
      }

      const secretKeys = [
        'google_access_token',
        'google_refresh_token',
        'google_token_expiry',
        'google_user_email',
        'google_granted_scopes',
      ];

      for (const key of secretKeys) {
        try {
          await secretRepo.delete(tenantId, key);
        } catch (err) {
          logger.error({ err, tenantId, key }, `Failed to delete ${key} secret`);
        }
      }

      clearTokenCache(tenantId);

      logger.info({ tenantId }, 'Google integration disconnected');
      res.status(200).json({ disconnected: true, tenant_id: tenantId });
    },
  );

  return router;
}
