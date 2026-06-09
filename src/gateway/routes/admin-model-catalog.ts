import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { GO_MODEL_MAP } from '../../lib/go-models.js';
import { uuidField } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { isPrismaError } from '../lib/prisma-helpers.js';

const ModelCatalogParamSchema = z.object({
  id: uuidField(),
});

const ListModelCatalogQuerySchema = z.object({
  include_inactive: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

const CreateModelCatalogBodySchema = z.object({
  model_id: z.string().min(1),
  display_name: z.string().min(1),
  provider: z.string().min(1),
  context_window: z.number().int().positive(),
  input_cost_per_million: z.number().min(0),
  output_cost_per_million: z.number().min(0),
  supports_tools: z.boolean(),
  supports_structured_output: z.boolean(),
  description: z.string().optional(),
  is_free: z.boolean().default(false),
  throughput_tokens_per_sec: z.number().optional(),
  latency_seconds: z.number().optional(),
  tool_call_error_rate: z.number().optional(),
  structured_output_error_rate: z.number().optional(),
  quality_index: z.number().optional(),
  agentic_score: z.number().optional(),
  tool_use_score: z.number().optional(),
  instruction_following_score: z.number().optional(),
  non_hallucination_rate: z.number().optional(),
  is_active: z.boolean().default(true),
  notes: z.string().optional(),
  strengths: z.string().optional(),
  weaknesses: z.string().optional(),
});

const PatchModelCatalogBodySchema = z
  .object({
    model_id: z.string().min(1).optional(),
    display_name: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    context_window: z.number().int().positive().optional(),
    input_cost_per_million: z.number().min(0).optional(),
    output_cost_per_million: z.number().min(0).optional(),
    supports_tools: z.boolean().optional(),
    supports_structured_output: z.boolean().optional(),
    description: z.string().optional(),
    is_free: z.boolean().optional(),
    throughput_tokens_per_sec: z.number().optional(),
    latency_seconds: z.number().optional(),
    tool_call_error_rate: z.number().optional(),
    structured_output_error_rate: z.number().optional(),
    quality_index: z.number().optional(),
    agentic_score: z.number().optional(),
    tool_use_score: z.number().optional(),
    instruction_following_score: z.number().optional(),
    non_hallucination_rate: z.number().optional(),
    is_active: z.boolean().optional(),
    notes: z.string().optional(),
    strengths: z.string().optional(),
    weaknesses: z.string().optional(),
  })
  .superRefine((obj, ctx) => {
    if (Object.keys(obj).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required for update',
      });
    }
  });

function computeSupportedGateways(modelId: string): string[] {
  return GO_MODEL_MAP.has(modelId) ? ['opencode-go', 'openrouter'] : ['openrouter'];
}

export function adminModelCatalogRoutes({ prisma }: { prisma: PrismaClient }): Router {
  const router = Router();
  const logger = createLogger('admin-model-catalog');

  router.get('/admin/model-catalog', requireAdminKey, async (req, res) => {
    const queryResult = ListModelCatalogQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: queryResult.error.issues });
      return;
    }

    const { include_inactive } = queryResult.data;

    try {
      const models = await prisma.modelCatalog.findMany({
        where: {
          deleted_at: null,
          ...(include_inactive ? {} : { is_active: true }),
        },
        orderBy: { created_at: 'desc' },
      });
      sendSuccess(
        res,
        200,
        models.map((m) => ({ ...m, supported_gateways: computeSupportedGateways(m.model_id) })),
      );
    } catch (err) {
      logger.error({ err }, 'Failed to list model catalog');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.get('/admin/model-catalog/:id', requireAdminKey, async (req, res) => {
    const paramResult = ModelCatalogParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }

    const { id } = paramResult.data;

    try {
      const model = await prisma.modelCatalog.findFirst({
        where: { id, deleted_at: null },
      });

      if (!model) {
        sendError(res, 404, 'NOT_FOUND');
        return;
      }

      sendSuccess(res, 200, {
        ...model,
        supported_gateways: computeSupportedGateways(model.model_id),
      });
    } catch (err) {
      logger.error({ err }, 'Failed to get model catalog entry');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.post('/admin/model-catalog', requireAdminKey, async (req, res) => {
    const bodyResult = CreateModelCatalogBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
      return;
    }

    try {
      const created = await prisma.modelCatalog.create({
        data: bodyResult.data,
      });
      sendSuccess(res, 201, created);
    } catch (err) {
      if (isPrismaError(err) && err.code === 'P2002') {
        sendError(res, 409, 'MODEL_ID_TAKEN', 'A model with this model_id already exists');
        return;
      }
      logger.error({ err }, 'Failed to create model catalog entry');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.patch('/admin/model-catalog/:id', requireAdminKey, async (req, res) => {
    const paramResult = ModelCatalogParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }

    const bodyResult = PatchModelCatalogBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
      return;
    }

    const { id } = paramResult.data;

    try {
      const existing = await prisma.modelCatalog.findFirst({
        where: { id, deleted_at: null },
      });

      if (!existing) {
        sendError(res, 404, 'NOT_FOUND');
        return;
      }

      const updated = await prisma.modelCatalog.update({
        where: { id },
        data: bodyResult.data,
      });

      sendSuccess(res, 200, updated);
    } catch (err) {
      if (isPrismaError(err) && err.code === 'P2002') {
        sendError(res, 409, 'MODEL_ID_TAKEN', 'A model with this model_id already exists');
        return;
      }
      logger.error({ err }, 'Failed to update model catalog entry');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.delete('/admin/model-catalog/:id', requireAdminKey, async (req, res) => {
    const paramResult = ModelCatalogParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }

    const { id } = paramResult.data;

    try {
      const existing = await prisma.modelCatalog.findFirst({
        where: { id, deleted_at: null },
      });

      if (!existing) {
        sendError(res, 404, 'NOT_FOUND');
        return;
      }

      await prisma.modelCatalog.update({
        where: { id },
        data: { deleted_at: new Date() },
      });

      sendSuccess(res, 200, { success: true });
    } catch (err) {
      logger.error({ err }, 'Failed to soft-delete model catalog entry');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}
