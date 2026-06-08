import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { createLogger } from '../../lib/logger.js';
import { requireAdminKey } from '../middleware/admin-auth.js';
import {
  TriggerEmployeeParamsSchema,
  TriggerEmployeeQuerySchema,
  InputSchemaSchema,
} from '../validation/schemas.js';
import { dispatchEmployee } from '../services/employee-dispatcher.js';
import { createInngestClient } from '../inngest/client.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import type { InngestLike } from '../types.js';

const logger = createLogger('admin-employee-trigger');

const TriggerEmployeeBodySchema = z
  .object({
    inputs: z.record(z.string(), z.string()).optional(),
    prompt: z.string().optional(),
  })
  .optional();

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
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: paramsResult.error.issues,
        });
        return;
      }

      const queryResult = TriggerEmployeeQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: queryResult.error.issues,
        });
        return;
      }

      const bodyResult = TriggerEmployeeBodySchema.safeParse(
        req.body && Object.keys(req.body).length > 0 ? req.body : undefined,
      );
      if (!bodyResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: bodyResult.error.issues,
        });
        return;
      }

      const { tenantId, slug } = paramsResult.data;
      const dryRun = queryResult.data.dry_run ?? false;
      const rawInputs = bodyResult.data?.inputs;
      const prompt = bodyResult.data?.prompt?.trim();
      const inputs: Record<string, string> | undefined =
        rawInputs || prompt ? { ...(rawInputs ?? {}), ...(prompt ? { prompt } : {}) } : undefined;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { tenant_id: tenantId, role_name: slug, status: 'active', deleted_at: null },
        });

        if (archetype?.input_schema) {
          const schemaResult = InputSchemaSchema.safeParse(archetype.input_schema);
          if (schemaResult.success) {
            const requiredEveryRunKeys = schemaResult.data
              .filter((item) => item.frequency === 'every_run' && item.required)
              .map((item) => item.key);

            if (requiredEveryRunKeys.length > 0) {
              const missing = requiredEveryRunKeys.filter((key) => !inputs || !(key in inputs));
              if (missing.length > 0) {
                sendError(res, 422, 'MISSING_REQUIRED_INPUTS', undefined, { missing });
                return;
              }
            }
          }
        }

        const result = await dispatchEmployee({ tenantId, slug, dryRun, prisma, inngest, inputs });

        if (result.kind === 'dispatched') {
          sendSuccess(res, 202, {
            task_id: result.taskId,
            status_url: `/admin/tenants/${tenantId}/tasks/${result.taskId}`,
          });
          return;
        }

        if (result.kind === 'dry_run') {
          sendSuccess(res, 200, {
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
          sendError(res, 404, ERROR_CODES.NOT_FOUND, result.message);
          return;
        }

        if (result.code === 'UNSUPPORTED_RUNTIME') {
          sendError(res, 501, 'NOT_IMPLEMENTED', result.message);
          return;
        }

        if (result.code === 'MODEL_NOT_CONFIGURED') {
          sendError(res, 422, 'MODEL_NOT_CONFIGURED', result.message);
          return;
        }

        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      } catch (err) {
        logger.error(
          { err },
          'Unexpected error in POST /admin/tenants/:tenantId/employees/:slug/trigger',
        );
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  return router;
}
