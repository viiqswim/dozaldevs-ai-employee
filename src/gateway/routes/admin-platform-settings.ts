import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdminKey } from '../middleware/admin-auth.js';

const PatchPlatformSettingBodySchema = z.object({
  value: z.string(),
});

export function adminPlatformSettingsRoutes({ prisma }: { prisma: PrismaClient }): Router {
  const router = Router();
  const logger = createLogger('admin-platform-settings');

  router.get('/admin/platform-settings', requireAdminKey, async (_req, res) => {
    try {
      const settings = await prisma.platformSetting.findMany({
        where: { deleted_at: null },
        orderBy: { key: 'asc' },
      });
      res.status(200).json(settings);
    } catch (err) {
      logger.error({ err }, 'Failed to list platform settings');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.patch('/admin/platform-settings/:key', requireAdminKey, async (req, res) => {
    const bodyResult = PatchPlatformSettingBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
      return;
    }

    const key = String(req.params.key);

    try {
      const existing = await prisma.platformSetting.findFirst({
        where: { key, deleted_at: null },
      });

      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      const updated = await prisma.platformSetting.update({
        where: { id: existing.id },
        data: { value: bodyResult.data.value },
      });

      res.status(200).json(updated);
    } catch (err) {
      logger.error({ err }, 'Failed to update platform setting');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
