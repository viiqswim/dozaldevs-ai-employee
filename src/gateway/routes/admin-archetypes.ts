import { Router } from 'express';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantIdParamSchema } from '../validation/schemas.js';

export interface AdminArchetypesRouteOptions {
  prisma?: PrismaClient;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidField = () =>
  z.string().regex(UUID_REGEX, 'Invalid UUID — expected 8-4-4-4-12 hex format');

const ArchetypeParamSchema = TenantIdParamSchema.extend({
  archetypeId: uuidField(),
});

const PatchArchetypeBodySchema = z
  .object({
    role_name: z.string().min(1).max(200).optional(),
    model: z.string().min(1).max(200).optional(),
    runtime: z.string().min(1).max(100).optional(),
    instructions: z.string().optional(),
    system_prompt: z.string().optional(),
    risk_model: z.record(z.string(), z.unknown()).optional(),
    concurrency_limit: z.number().int().positive().optional(),
    notification_channel: z.string().optional(),
    vm_size: z.string().optional(),
    deliverable_type: z.string().optional(),
  })
  .superRefine((obj, ctx) => {
    if (Object.keys(obj).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required for update',
      });
    }
  });

export function adminArchetypesRoutes(opts: AdminArchetypesRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();

  router.patch(
    '/admin/tenants/:tenantId/archetypes/:archetypeId',
    requireAdminKey,
    async (req, res) => {
      const paramResult = ArchetypeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
        return;
      }

      const bodyResult = PatchArchetypeBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;

      try {
        const existing = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId },
        });

        if (!existing) {
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }

        const { risk_model, ...rest } = bodyResult.data;
        const updated = await prisma.archetype.update({
          where: { id: archetypeId },
          data: {
            ...rest,
            ...(risk_model !== undefined && { risk_model: risk_model as Prisma.InputJsonValue }),
          },
        });

        res.status(200).json(updated);
      } catch (err) {
        logger.error({ err }, 'Failed to update archetype');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  return router;
}
