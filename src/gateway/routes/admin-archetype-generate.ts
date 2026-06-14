import { Router } from 'express';
import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient, TenantRole } from '@prisma/client';
import type { callLLM } from '../../lib/call-llm.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantIdParamSchema } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { ArchetypeGenerator } from '../services/archetype-generator.js';
import { ComposioConnectionRepository } from '../../repositories/composio-connection-repository.js';
import { ArchetypeGenerationCallRepository } from '../../repositories/ArchetypeGenerationCallRepository.js';
import { getConnectableToolkits } from '../../lib/composio/connectable-apps.js';

export interface AdminArchetypeGenerateRouteOptions {
  callLLM: typeof callLLM;
  prisma?: PrismaClient;
}

export const GENERATION_FAILED_FRIENDLY_MESSAGE =
  "We couldn't generate your employee from that description. Please try again, or add more detail about what you want it to do.";

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
  const generationCallRepo = new ArchetypeGenerationCallRepository(prisma);
  const generator = new ArchetypeGenerator(opts.callLLM, generationCallRepo);
  const composioRepo = new ComposioConnectionRepository(prisma);

  router.post(
    '/admin/tenants/:tenantId/archetypes/generate',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID, undefined, {
          issues: paramResult.error.issues,
        });
        return;
      }

      const bodyResult = GenerateBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: bodyResult.error.issues,
        });
        return;
      }

      const { tenantId } = paramResult.data;
      const { description, previous_config, refinement_instruction } = bodyResult.data;
      const generationContext = {
        tenantId,
        createdBy: req.auth?.id ?? null,
      };

      try {
        const catalog = await prisma.modelCatalog.findMany({
          where: { deleted_at: null, is_active: true },
        });

        const activeConnections = await composioRepo.getActiveConnections(tenantId);
        const connectedToolkits = activeConnections.map((c) => c.toolkit);

        let connectableToolkits: string[] = [];
        try {
          const connectable = await getConnectableToolkits();
          connectableToolkits = Array.from(connectable);
        } catch (composioErr) {
          logger.warn(
            { err: composioErr },
            'getConnectableToolkits failed — proceeding with empty connectable set',
          );
        }

        const suggestedToolkits = connectableToolkits.filter((t) => !connectedToolkits.includes(t));

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
            { connectedToolkits, connectableToolkits },
            generationContext,
          );
        } else {
          result = await generator.generate(
            description,
            catalog,
            { connectedToolkits, connectableToolkits },
            generationContext,
          );
        }

        sendSuccess(res, 200, { ...result, connectedToolkits, suggestedToolkits });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (message.includes('GENERATION_FAILED')) {
          sendError(res, 422, 'GENERATION_FAILED', GENERATION_FAILED_FRIENDLY_MESSAGE, {
            details: message,
          });
          return;
        }

        logger.error({ err }, 'Archetype generation failed');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  return router;
}
