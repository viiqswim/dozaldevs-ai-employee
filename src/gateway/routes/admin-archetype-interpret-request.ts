import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient, TenantRole } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import type { callLLM } from '../../lib/call-llm.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { uuidField } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { ArchetypeGenerator } from '../services/archetype-generator.js';
import { mapArchetypeRowToConfig } from '../lib/archetype-edit-helpers.js';

const logger = createLogger('admin-archetype-interpret-request');

export interface AdminArchetypeInterpretRequestRouteOptions {
  callLLM: typeof callLLM;
  prisma?: PrismaClient;
}

const InterpretRequestParamsSchema = z.object({
  tenantId: uuidField(),
  archetypeId: uuidField(),
});

const InterpretRequestBodySchema = z.object({
  request_text: z.string().min(1).max(500),
});

export function adminArchetypeInterpretRequestRoutes(
  opts: AdminArchetypeInterpretRequestRouteOptions,
): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const generator = new ArchetypeGenerator(opts.callLLM);

  router.post(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/interpret-request',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.MEMBER),
    async (req, res) => {
      const paramResult = InterpretRequestParamsSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID, undefined, {
          issues: paramResult.error.issues,
        });
        return;
      }

      const bodyResult = InterpretRequestBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: bodyResult.error.issues,
        });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;
      const { request_text } = bodyResult.data;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId, deleted_at: null },
        });
        if (!archetype) {
          sendError(res, 404, ERROR_CODES.NOT_FOUND, 'Archetype not found');
          return;
        }

        const archetypeConfig = mapArchetypeRowToConfig(archetype as Record<string, unknown>);
        const understanding = await generator.interpretRequest(request_text, archetypeConfig);

        sendSuccess(res, 200, { understanding });
      } catch (err) {
        logger.error({ err }, 'Archetype interpret-request failed');
        sendError(res, 500, 'INTERPRET_FAILED', 'Failed to interpret request');
      }
    },
  );

  return router;
}
