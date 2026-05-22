import { Router } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import type { callLLM } from '../../lib/call-llm.js';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
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

export function adminArchetypeGenerateRoutes(opts: AdminArchetypeGenerateRouteOptions): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();
  const generator = new ArchetypeGenerator(opts.callLLM);

  router.post('/admin/tenants/:tenantId/archetypes/generate', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
      return;
    }

    const bodyResult = GenerateBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
      return;
    }

    const { tenantId } = paramResult.data;
    const { description, previous_config, refinement_instruction } = bodyResult.data;

    try {
      const catalog = await prisma.modelCatalog.findMany({
        where: { tenant_id: tenantId, deleted_at: null, is_active: true },
      });

      let result;

      if (previous_config !== undefined && refinement_instruction !== undefined) {
        result = await generator.refine(
          previous_config as unknown as Parameters<typeof generator.refine>[0],
          refinement_instruction,
          catalog,
        );
      } else {
        result = await generator.generate(description, catalog);
      }

      res.status(200).json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      if (message.includes('GENERATION_FAILED')) {
        res.status(422).json({ error: 'GENERATION_FAILED', details: message });
        return;
      }

      logger.error({ err }, 'Archetype generation failed');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
