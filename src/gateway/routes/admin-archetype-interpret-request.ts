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
import {
  ArchetypeGenerator,
  type GenerateArchetypeResponse,
} from '../services/archetype-generator.js';
import type { InputSchemaItem } from '../validation/schemas.js';

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

function mapArchetypeRowToConfig(row: Record<string, unknown>): GenerateArchetypeResponse {
  const riskModel = (row.risk_model ?? {}) as Record<string, unknown>;
  return {
    role_name: String(row.role_name ?? ''),
    model: String(row.model ?? 'deepseek/deepseek-v4-flash'),
    runtime: 'opencode',
    identity: String(row.identity ?? ''),
    execution_steps: String(row.execution_steps ?? ''),
    delivery_steps: typeof row.delivery_steps === 'string' ? row.delivery_steps : null,
    delivery_instructions:
      typeof row.delivery_instructions === 'string' ? row.delivery_instructions : null,
    instructions: String(row.execution_instructions ?? ''),
    deliverable_type: typeof row.deliverable_type === 'string' ? row.deliverable_type : null,
    input_schema: Array.isArray(row.input_schema)
      ? (row.input_schema as InputSchemaItem[])
      : undefined,
    risk_model: {
      approval_required: Boolean(riskModel.approval_required),
      timeout_hours: typeof riskModel.timeout_hours === 'number' ? riskModel.timeout_hours : 24,
    },
    trigger_sources: (row.trigger_sources ?? {
      type: 'manual',
    }) as GenerateArchetypeResponse['trigger_sources'],
    tool_registry: {
      tools: Array.isArray((row.tool_registry as Record<string, unknown>)?.tools)
        ? ((row.tool_registry as Record<string, unknown>).tools as string[])
        : [],
    },
    concurrency_limit: typeof row.concurrency_limit === 'number' ? row.concurrency_limit : 1,
    vm_size: typeof row.vm_size === 'string' ? row.vm_size : null,
    worker_env:
      row.worker_env && typeof row.worker_env === 'object'
        ? (row.worker_env as Record<string, string>)
        : null,
    platform_rules_override:
      typeof row.platform_rules_override === 'string' ? row.platform_rules_override : null,
    estimated_manual_minutes:
      typeof row.estimated_manual_minutes === 'number' ? row.estimated_manual_minutes : null,
    overview: (row.overview ?? {
      role: '',
      trigger: '',
      workflow: [],
      tools_used: '',
      output: '',
      approval: '',
    }) as GenerateArchetypeResponse['overview'],
  };
}

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
