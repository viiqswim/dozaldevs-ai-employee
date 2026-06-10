import { Router } from 'express';
import path from 'path';
import { createLogger } from '../../lib/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requirePermission } from '../middleware/authz.js';
import { PERMISSIONS } from '../../lib/auth/permissions.js';
import {
  discoverTools,
  getToolByPath,
  parseSkillMd,
  enrichTools,
} from '../services/tool-parser.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

export function adminToolsRoutes(): Router {
  const router = Router();
  const logger = createLogger('admin-tools');

  const basePath = path.join(process.cwd(), 'src/worker-tools');
  const skillPath = path.join(process.cwd(), 'src/workers/skills/tool-usage-reference/SKILL.md');

  router.get(
    '/admin/tools',
    authMiddleware,
    requireAuth,
    requirePermission(PERMISSIONS.MANAGE_TENANTS),
    async (_req, res) => {
      try {
        const tools = await discoverTools(basePath);
        const enrichments = await parseSkillMd(skillPath);
        const enriched = enrichTools(tools, enrichments);
        sendSuccess(res, 200, { tools: enriched });
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
        const tool = await getToolByPath(basePath, service, toolName);
        if (!tool) {
          sendError(res, 404, 'NOT_FOUND', 'Tool not found');
          return;
        }
        const enrichments = await parseSkillMd(skillPath);
        const [enriched] = enrichTools([tool], enrichments);
        sendSuccess(res, 200, enriched);
      } catch (err) {
        logger.error({ err }, 'Failed to get tool');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  return router;
}
