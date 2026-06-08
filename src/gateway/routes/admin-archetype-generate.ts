import { Router } from 'express';
import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import type { callLLM } from '../../lib/call-llm.js';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { ArchetypeGenerator } from '../services/archetype-generator.js';

export interface AdminArchetypeGenerateRouteOptions {
  callLLM: typeof callLLM;
  prisma?: PrismaClient;
}

const GenerateBodySchema = z.object({
  description: z.string().min(10).max(2000),
  previous_config: z.record(z.string(), z.unknown()).optional(),
  refinement_instruction: z.string().max(500).optional(),
});

// refine() only reads these fields directly; the rest is JSON-stringified as-is.
const PreviousConfigSchema = z
  .object({
    role_name: z.string(),
    identity: z.string(),
    execution_steps: z.string(),
  })
  .passthrough();

export function adminArchetypeGenerateRoutes(opts: AdminArchetypeGenerateRouteOptions): Router {
  const router = Router();
  const logger = createLogger('admin-archetype-generate');
  const prisma = opts.prisma ?? new PrismaClient();
  const generator = new ArchetypeGenerator(opts.callLLM);

  router.post('/admin/tenants/:tenantId/archetypes/generate', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_ID, undefined, { issues: paramResult.error.issues });
      return;
    }

    const bodyResult = GenerateBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
        issues: bodyResult.error.issues,
      });
      return;
    }

    const { description, previous_config, refinement_instruction } = bodyResult.data;

    try {
      const catalog = await prisma.modelCatalog.findMany({
        where: { deleted_at: null, is_active: true },
      });

      let result;

      if (previous_config !== undefined && refinement_instruction !== undefined) {
        const prevResult = PreviousConfigSchema.safeParse(previous_config);
        if (!prevResult.success) {
          sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
            issues: prevResult.error.issues,
          });
          return;
        }

        result = await generator.refine(
          previous_config as unknown as Parameters<typeof generator.refine>[0],
          refinement_instruction,
          catalog,
        );
      } else {
        result = await generator.generate(description, catalog);
      }

      sendSuccess(res, 200, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('GENERATION_FAILED')) {
        sendError(res, 422, 'GENERATION_FAILED', undefined, { details: message });
        return;
      }

      logger.error({ err }, 'Archetype generation failed');
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
    }
  });

  return router;
}
