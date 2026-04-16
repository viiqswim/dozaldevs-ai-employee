import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TriggerEmployeeParamsSchema, TriggerEmployeeQuerySchema } from '../validation/schemas.js';
import { dispatchEmployee } from '../services/employee-dispatcher.js';
import { createInngestClient } from '../inngest/client.js';
import type { InngestLike } from '../types.js';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface AdminEmployeeTriggerRouteOptions {
  prisma?: PrismaClient;
  inngest?: InngestLike;
}

export function adminEmployeeTriggerRoutes(opts: AdminEmployeeTriggerRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const inngest = opts.inngest ?? createInngestClient();

  router.post(
    '/admin/tenants/:tenantId/employees/:slug/trigger',
    requireAdminKey,
    async (req, res) => {
      const paramsResult = TriggerEmployeeParamsSchema.safeParse(req.params);
      if (!paramsResult.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: paramsResult.error.issues });
        return;
      }

      const queryResult = TriggerEmployeeQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: queryResult.error.issues });
        return;
      }

      const { tenantId, slug } = paramsResult.data;
      const dryRun = queryResult.data.dry_run ?? false;

      try {
        const result = await dispatchEmployee({ tenantId, slug, dryRun, prisma, inngest });

        if (result.kind === 'dispatched') {
          res.status(202).json({
            task_id: result.taskId,
            status_url: `/admin/tenants/${tenantId}/tasks/${result.taskId}`,
          });
          return;
        }

        if (result.kind === 'dry_run') {
          res.status(200).json({
            valid: true,
            would_fire: {
              event_name: result.wouldFire.eventName,
              data: result.wouldFire.data,
              external_id: result.wouldFire.externalId,
            },
            archetype_id: result.archetypeId,
          });
          return;
        }

        if (result.code === 'ARCHETYPE_NOT_FOUND') {
          res.status(404).json({ error: 'NOT_FOUND', message: result.message });
          return;
        }

        if (result.code === 'UNSUPPORTED_RUNTIME') {
          res.status(501).json({ error: 'NOT_IMPLEMENTED', message: result.message });
          return;
        }

        res.status(500).json({ error: 'INTERNAL_ERROR' });
      } catch (err) {
        logger.error(
          { err },
          'Unexpected error in POST /admin/tenants/:tenantId/employees/:slug/trigger',
        );
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  return router;
}
