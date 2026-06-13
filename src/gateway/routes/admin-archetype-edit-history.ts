import { Router } from 'express';
import { PrismaClient, Prisma, TenantRole } from '@prisma/client';
import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantIdParamSchema, uuidField } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

export interface AdminArchetypeEditHistoryRouteOptions {
  prisma?: PrismaClient;
}

const EditHistoryParamSchema = TenantIdParamSchema.extend({
  archetypeId: uuidField(),
});

const RecordEditHistoryBodySchema = z.object({
  request_text: z.string(),
  before_json: z.record(z.string(), z.unknown()),
  after_json: z.record(z.string(), z.unknown()),
  changed_fields: z.array(z.string()),
  kind: z.enum(['edit', 'revert']),
});

const ListEditHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const DEFAULT_LIMIT = 50;

export function adminArchetypeEditHistoryRoutes(
  opts: AdminArchetypeEditHistoryRouteOptions = {},
): Router {
  const router = Router();
  const logger = createLogger('admin-archetype-edit-history');
  const prisma = opts.prisma ?? new PrismaClient();

  router.post(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/edit-history',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = EditHistoryParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }

      const bodyResult = RecordEditHistoryBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;
      const { request_text, before_json, after_json, changed_fields, kind } = bodyResult.data;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId, deleted_at: null },
        });
        if (!archetype) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }

        const actorUserId = req.auth?.id ?? null;

        const created = await prisma.archetypeEditHistory.create({
          data: {
            archetype_id: archetypeId,
            tenant_id: tenantId,
            request_text,
            before_json: before_json as Prisma.InputJsonValue,
            after_json: after_json as Prisma.InputJsonValue,
            changed_fields: changed_fields as Prisma.InputJsonValue,
            kind,
            actor_user_id: actorUserId,
          },
        });

        sendSuccess(res, 201, created);
      } catch (err) {
        logger.error({ err }, 'Failed to record archetype edit history');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.get(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/edit-history',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = EditHistoryParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }

      const queryResult = ListEditHistoryQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: queryResult.error.issues });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;
      const limit = queryResult.data.limit ?? DEFAULT_LIMIT;

      try {
        const rows = await prisma.archetypeEditHistory.findMany({
          where: { tenant_id: tenantId, archetype_id: archetypeId, deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: limit,
        });

        sendSuccess(res, 200, rows);
      } catch (err) {
        logger.error({ err }, 'Failed to list archetype edit history');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  return router;
}
