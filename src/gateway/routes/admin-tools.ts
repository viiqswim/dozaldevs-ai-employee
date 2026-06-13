import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { PERMISSIONS } from '../../lib/auth/permissions.js';
import { discoverTools } from '../services/tool-parser.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

export function adminToolsRoutes(): Router {
  const router = Router();
  const logger = createLogger('admin-tools');

  router.get(
    '/admin/tools',
    authMiddleware,
    requireAuth,
    requirePermission(PERMISSIONS.MANAGE_TENANTS),
    async (_req, res) => {
      try {
        const tools = await discoverTools();
        sendSuccess(res, 200, { tools });
      } catch (err) {
        logger.error({ err }, 'Failed to list tools');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.get(
    '/admin/tools/:service/:toolName',
    authMiddleware,
    requireAuth,
    requirePermission(PERMISSIONS.MANAGE_TENANTS),
    async (req, res) => {
      try {
        const service = req.params['service'] as string;
        const toolName = req.params['toolName'] as string;
        const tools = await discoverTools();
        const tool = tools.find((t) => t.service === service && t.name === toolName);
        if (!tool) {
          sendError(res, 404, 'NOT_FOUND', 'Tool not found');
          return;
        }
        sendSuccess(res, 200, tool);
      } catch (err) {
        logger.error({ err }, 'Failed to get tool');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  return router;
}
