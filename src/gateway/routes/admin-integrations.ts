import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient, TenantRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantSecretRepository } from '../../repositories/tenant-secret-repository.js';
import { TenantIntegrationRepository } from '../services/tenant-integration-repository.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

export interface AdminIntegrationsRouteOptions {
  prisma?: PrismaClient;
}

export function adminIntegrationsRoutes(opts: AdminIntegrationsRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('admin-integrations');
  const prisma = opts.prisma ?? new PrismaClient();
  const secretRepo = new TenantSecretRepository(prisma);
  const integrationRepo = new TenantIntegrationRepository(prisma);

  router.delete(
    '/admin/tenants/:tenantId/integrations/slack',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.OWNER),
    async (req, res) => {
      const parsed = TenantIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        sendError(res, 400, 'Invalid tenantId');
        return;
      }
      const { tenantId } = parsed.data;

      try {
        await integrationRepo.delete(tenantId, 'slack');
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to delete Slack integration record');
      }

      try {
        await secretRepo.delete(tenantId, 'slack_bot_token');
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to delete slack_bot_token secret');
      }

      logger.info({ tenantId }, 'Slack integration disconnected');
      sendSuccess(res, 200, { disconnected: true, tenant_id: tenantId });
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/integrations/jira',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.OWNER),
    async (req, res) => {
      const parsed = TenantIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        sendError(res, 400, 'Invalid tenantId');
        return;
      }
      const { tenantId } = parsed.data;

      try {
        await integrationRepo.delete(tenantId, 'jira');
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to delete Jira integration record');
      }

      const secretKeys = [
        'jira_access_token',
        'jira_refresh_token',
        'jira_cloud_id',
        'jira_site_url',
      ];
      for (const key of secretKeys) {
        try {
          await secretRepo.delete(tenantId, key);
        } catch (err) {
          logger.error({ err, tenantId, key }, `Failed to delete ${key} secret`);
        }
      }

      logger.info({ tenantId }, 'Jira integration disconnected');
      sendSuccess(res, 200, { disconnected: true, tenant_id: tenantId });
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/integrations/notion',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.OWNER),
    async (req, res) => {
      const parsed = TenantIdParamSchema.safeParse(req.params);
      if (!parsed.success) {
        sendError(res, 400, 'Invalid tenantId');
        return;
      }
      const { tenantId } = parsed.data;

      try {
        await integrationRepo.delete(tenantId, 'notion');
      } catch (err) {
        logger.error({ err, tenantId }, 'Failed to delete Notion integration record');
      }

      const secretKeys = [
        'notion_access_token',
        'notion_refresh_token',
        'notion_workspace_id',
        'notion_workspace_name',
      ];
      for (const key of secretKeys) {
        try {
          await secretRepo.delete(tenantId, key);
        } catch (err) {
          logger.error({ err, tenantId, key }, `Failed to delete ${key} secret`);
        }
      }

      logger.info({ tenantId }, 'Notion integration disconnected');
      sendSuccess(res, 200, { disconnected: true, tenant_id: tenantId });
    },
  );

  return router;
}
