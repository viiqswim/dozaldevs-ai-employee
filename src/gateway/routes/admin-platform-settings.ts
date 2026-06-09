import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';

const PatchPlatformSettingBodySchema = z.object({
  value: z.string(),
});

export function adminPlatformSettingsRoutes(opts: { prisma?: PrismaClient } = {}): Router {
  const { prisma = new PrismaClient() } = opts;
  const router = Router();
  const logger = createLogger('admin-platform-settings');

  router.get('/admin/platform-settings', requireAdminKey, async (_req, res) => {
    try {
      const settings = await prisma.platformSetting.findMany({
        where: { deleted_at: null },
        orderBy: { key: 'asc' },
      });
      sendSuccess(res, 200, settings);
    } catch (err) {
      logger.error({ err }, 'Failed to list platform settings');
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
    }
  });

  router.patch('/admin/platform-settings/:key', requireAdminKey, async (req, res) => {
    const bodyResult = PatchPlatformSettingBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
        issues: bodyResult.error.issues,
      });
      return;
    }

    const key = String(req.params.key);

    try {
      const existing = await prisma.platformSetting.findFirst({
        where: { key, deleted_at: null },
      });

      if (!existing) {
        sendError(res, 404, ERROR_CODES.NOT_FOUND);
        return;
      }

      const updated = await prisma.platformSetting.update({
        where: { id: existing.id },
        data: { value: bodyResult.data.value },
      });

      sendSuccess(res, 200, updated);
    } catch (err) {
      logger.error({ err }, 'Failed to update platform setting');
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
    }
  });

  return router;
}
