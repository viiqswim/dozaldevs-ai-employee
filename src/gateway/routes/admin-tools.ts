import { Router } from 'express';
import path from 'path';
import pino from 'pino';
import { requireAdminKey } from '../middleware/admin-auth.js';
import {
  discoverTools,
  getToolByPath,
  parseSkillMd,
  enrichTools,
} from '../services/tool-parser.js';

export function adminToolsRoutes(): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

  const basePath = path.join(process.cwd(), 'src/worker-tools');
  const skillPath = path.join(process.cwd(), 'src/workers/skills/tool-usage-reference/SKILL.md');

  router.get('/admin/tools', requireAdminKey, async (_req, res) => {
    try {
      const tools = await discoverTools(basePath);
      const enrichments = await parseSkillMd(skillPath);
      const enriched = enrichTools(tools, enrichments);
      res.status(200).json({ tools: enriched });
    } catch (err) {
      logger.error({ err }, 'Failed to list tools');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/admin/tools/:service/:toolName', requireAdminKey, async (req, res) => {
    try {
      const service = req.params['service'] as string;
      const toolName = req.params['toolName'] as string;
      const tool = await getToolByPath(basePath, service, toolName);
      if (!tool) {
        res.status(404).json({ error: 'Tool not found' });
        return;
      }
      const enrichments = await parseSkillMd(skillPath);
      const [enriched] = enrichTools([tool], enrichments);
      res.status(200).json(enriched);
    } catch (err) {
      logger.error({ err }, 'Failed to get tool');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
