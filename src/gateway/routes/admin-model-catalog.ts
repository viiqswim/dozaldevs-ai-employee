import { Router } from 'express';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantIdParamSchema } from '../validation/schemas.js';

function isPrismaError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidField = () =>
  z.string().regex(UUID_REGEX, 'Invalid UUID — expected 8-4-4-4-12 hex format');

const ModelCatalogParamSchema = TenantIdParamSchema.extend({
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
  })
  .superRefine((obj, ctx) => {
    if (Object.keys(obj).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required for update',
      });
    }
  });

export function adminModelCatalogRoutes({ prisma }: { prisma: PrismaClient }): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

  router.get('/admin/tenants/:tenantId/model-catalog', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
      return;
    }

    const queryResult = ListModelCatalogQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: queryResult.error.issues });
      return;
    }

    const { tenantId } = paramResult.data;
    const { include_inactive } = queryResult.data;

    try {
      const models = await prisma.modelCatalog.findMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
          ...(include_inactive ? {} : { is_active: true }),
        },
        orderBy: { created_at: 'desc' },
      });
      res.status(200).json(models);
    } catch (err) {
      logger.error({ err }, 'Failed to list model catalog');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/admin/tenants/:tenantId/model-catalog/:id', requireAdminKey, async (req, res) => {
    const paramResult = ModelCatalogParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
      return;
    }

    const { tenantId, id } = paramResult.data;

    try {
      const model = await prisma.modelCatalog.findFirst({
        where: { id, tenant_id: tenantId, deleted_at: null },
      });

      if (!model) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      res.status(200).json(model);
    } catch (err) {
      logger.error({ err }, 'Failed to get model catalog entry');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.post('/admin/tenants/:tenantId/model-catalog', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
      return;
    }

    const bodyResult = CreateModelCatalogBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
      return;
    }

    const { tenantId } = paramResult.data;

    try {
      const created = await prisma.modelCatalog.create({
        data: {
          ...bodyResult.data,
          tenant_id: tenantId,
        },
      });
      res.status(201).json(created);
    } catch (err) {
      if (isPrismaError(err) && err.code === 'P2002') {
        res.status(409).json({
          error: 'MODEL_ID_TAKEN',
          message: 'A model with this model_id already exists for this tenant',
        });
        return;
      }
      logger.error({ err }, 'Failed to create model catalog entry');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.patch('/admin/tenants/:tenantId/model-catalog/:id', requireAdminKey, async (req, res) => {
    const paramResult = ModelCatalogParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
      return;
    }

    const bodyResult = PatchModelCatalogBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
      return;
    }

    const { tenantId, id } = paramResult.data;

    try {
      const existing = await prisma.modelCatalog.findFirst({
        where: { id, tenant_id: tenantId, deleted_at: null },
      });

      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      const updated = await prisma.modelCatalog.update({
        where: { id },
        data: bodyResult.data,
      });

      res.status(200).json(updated);
    } catch (err) {
      if (isPrismaError(err) && err.code === 'P2002') {
        res.status(409).json({
          error: 'MODEL_ID_TAKEN',
          message: 'A model with this model_id already exists for this tenant',
        });
        return;
      }
      logger.error({ err }, 'Failed to update model catalog entry');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.delete('/admin/tenants/:tenantId/model-catalog/:id', requireAdminKey, async (req, res) => {
    const paramResult = ModelCatalogParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
      return;
    }

    const { tenantId, id } = paramResult.data;

    try {
      const existing = await prisma.modelCatalog.findFirst({
        where: { id, tenant_id: tenantId, deleted_at: null },
      });

      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      await prisma.modelCatalog.update({
        where: { id },
        data: { deleted_at: new Date() },
      });

      res.status(200).json({ success: true });
    } catch (err) {
      logger.error({ err }, 'Failed to soft-delete model catalog entry');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
