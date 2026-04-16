import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { GetTaskParamsSchema } from '../validation/schemas.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface AdminTasksRouteOptions {
  prisma?: PrismaClient;
}

export function adminTasksRoutes(opts: AdminTasksRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  router.get('/admin/tenants/:tenantId/tasks/:id', requireAdminKey, async (req, res) => {
    const paramsResult = GetTaskParamsSchema.safeParse({
      tenantId: req.params.tenantId,
      id: req.params.id,
    });

    if (!paramsResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: paramsResult.error.issues });
      return;
    }

    const { tenantId, id } = paramsResult.data;

    try {
      const task = await prisma.task.findFirst({
        where: { id, tenant_id: tenantId },
        select: {
          id: true,
          status: true,
          source_system: true,
          external_id: true,
          archetype_id: true,
          created_at: true,
          updated_at: true,
        },
      });

      if (!task) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      res.status(200).json(task);
    } catch (err) {
      logger.error({ err }, 'Failed to get task');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
