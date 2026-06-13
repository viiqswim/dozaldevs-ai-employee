import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient, Prisma, TenantRole } from '@prisma/client';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantIdParamSchema, InputSchemaSchema, uuidField } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { isPrismaError } from '../lib/prisma-helpers.js';
import { ArchetypeRepository, ActiveTasksError } from '../services/archetype-repository.js';
import {
  analyzeArchetype,
  adjustProfileWithUserAnswers,
} from '../../lib/model-selection/profiler.js';
import { recommendModels } from '../../lib/model-selection/matcher.js';
import { TimeEstimator, shouldReEstimate } from '../services/time-estimator.js';
import { callLLM } from '../../lib/call-llm.js';

export interface AdminArchetypesRouteOptions {
  prisma?: PrismaClient;
}

const ArchetypeParamSchema = TenantIdParamSchema.extend({
  archetypeId: uuidField(),
});

const TriggerSourceSchema = z.union([
  z.object({ type: z.literal('manual') }),
  z.object({
    type: z.literal('scheduled'),
    cron: z.string(),
    timezone: z.string().optional(),
  }),
  z.object({
    type: z.literal('webhook'),
    event_type: z.string().optional(),
  }),
]);

const PatchArchetypeBodySchema = z
  .object({
    role_name: z.string().min(1).max(200).optional(),
    model: z.string().min(1).max(200).optional(),
    runtime: z.string().min(1).max(100).optional(),
    instructions: z.string().optional(),
    risk_model: z.record(z.string(), z.unknown()).optional(),
    concurrency_limit: z.number().int().positive().optional(),
    notification_channel: z.string().nullable().optional(),
    vm_size: z.string().optional(),
    deliverable_type: z.string().optional(),
    delivery_instructions: z.string().max(10000).nullable().optional(),
    trigger_sources: TriggerSourceSchema.nullable().optional(),
    tool_registry: z
      .object({ tools: z.array(z.string()) })
      .nullable()
      .optional(),
    status: z.enum(['active', 'draft', 'superseded']).optional(),
    overview: z.any().nullable().optional(),
    parent_draft_id: z.string().uuid().nullable().optional(),
    input_schema: InputSchemaSchema.optional(),
    worker_env: z.record(z.string(), z.string()).nullish(),
    estimated_manual_minutes_override: z.number().int().min(1).max(1440).nullable().optional(),
    identity: z.string().max(10000).nullable().optional(),
    execution_steps: z.string().nullable().optional(),
    delivery_steps: z.string().nullable().optional(),
    temperature: z.number().min(0).max(2).optional(),
    platform_rules_override: z.string().nullable().optional(),
  })
  .superRefine((obj, ctx) => {
    if (Object.keys(obj).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one field is required for update',
      });
    }
  });

const CreateArchetypeBodySchema = z.object({
  role_name: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'role_name must be kebab-case slug')
    .min(2)
    .max(60),
  model: z.string().min(1),
  runtime: z.literal('opencode'),
  instructions: z.string().min(1).max(5000),
  delivery_instructions: z.string().max(10000).nullable().default(null),
  deliverable_type: z.string().max(100).nullable().default(null),
  risk_model: z
    .object({
      approval_required: z.boolean(),
      timeout_hours: z.number().positive(),
    })
    .default({ approval_required: false, timeout_hours: 2 }),
  notification_channel: z.string().min(1).max(50).nullable().optional().default(null),
  concurrency_limit: z.number().int().min(1).max(20).default(3),
  trigger_sources: TriggerSourceSchema.nullable().default(null),
  tool_registry: z
    .object({ tools: z.array(z.string()) })
    .nullable()
    .default(null),
  status: z.enum(['active', 'draft']).default('active'),
  overview: z.any().nullable().optional().default(null),
  parent_draft_id: z.string().uuid().nullable().optional().default(null),
  input_schema: InputSchemaSchema.optional(),
  worker_env: z.record(z.string(), z.string()).nullish(),
  identity: z.string().max(10000).optional().default(''),
  execution_steps: z.string().max(10000).optional().default(''),
  delivery_steps: z.string().max(10000).nullable().optional().default(null),
  temperature: z.number().min(0).max(2).optional().default(1.0),
  platform_rules_override: z.string().nullable().optional().default(null),
});

const RecommendModelBodySchema = z.object({
  archetype: z.object({
    identity: z.string().default(''),
    instructions: z.string().min(1),
    deliverable_type: z.string().min(1),
  }),
  userAnswers: z
    .object({
      audience: z.enum(['external', 'internal']),
      frequency: z.enum(['frequent', 'daily', 'rare']),
      speedPreference: z.enum(['fast', 'relaxed']),
    })
    .optional(),
});

const MODEL_QUESTIONS = [
  {
    id: 'audience',
    question:
      'Will this employee communicate directly with your customers, or is it for internal use only?',
    options: [
      { value: 'external', label: 'Customer-facing' },
      { value: 'internal', label: 'Internal only' },
    ],
  },
  {
    id: 'frequency',
    question: 'How often will this employee run?',
    options: [
      { value: 'frequent', label: 'Multiple times a day' },
      { value: 'daily', label: 'About once a day' },
      { value: 'rare', label: 'A few times a week or less' },
    ],
  },
  {
    id: 'speedPreference',
    question: 'Does this employee need to respond quickly, or is a few minutes fine?',
    options: [
      { value: 'fast', label: 'Speed matters' },
      { value: 'relaxed', label: 'A few minutes is fine' },
    ],
  },
];

export function adminArchetypesRoutes(opts: AdminArchetypesRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('admin-archetypes');
  const prisma = opts.prisma ?? new PrismaClient();
  const repo = new ArchetypeRepository(prisma);
  const estimator = new TimeEstimator(callLLM);

  router.post(
    '/admin/tenants/:tenantId/archetypes',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }

      const bodyResult = CreateArchetypeBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
        return;
      }

      const { tenantId } = paramResult.data;
      const {
        risk_model,
        trigger_sources,
        tool_registry,
        overview,
        input_schema,
        worker_env,
        instructions,
        ...rest
      } = bodyResult.data;

      try {
        const newArchetype = await prisma.archetype.create({
          data: {
            ...rest,
            tenant_id: tenantId,
            execution_instructions: instructions,
            risk_model: risk_model as Prisma.InputJsonValue,
            ...(trigger_sources !== null && {
              trigger_sources: trigger_sources as Prisma.InputJsonValue,
            }),
            ...(tool_registry !== null && {
              tool_registry: tool_registry as Prisma.InputJsonValue,
            }),
            overview: overview !== null ? (overview as Prisma.InputJsonValue) : Prisma.JsonNull,
            ...(input_schema !== undefined && {
              input_schema: input_schema as Prisma.InputJsonValue,
            }),
            ...(worker_env != null && {
              worker_env: worker_env as Prisma.InputJsonValue,
            }),
          },
        });

        let resultArchetype = newArchetype;
        try {
          const estimated = await estimator.estimate(newArchetype);
          if (estimated !== null) {
            const reEstimated = await prisma.archetype.update({
              where: { id: newArchetype.id },
              data: { estimated_manual_minutes: estimated },
            });
            if (reEstimated) resultArchetype = reEstimated;
          }
        } catch (estimateErr) {
          logger.warn(
            { err: estimateErr },
            'Time estimation failed after create — returning archetype without estimate',
          );
        }

        sendSuccess(res, 201, resultArchetype);
      } catch (err) {
        if (isPrismaError(err) && err.code === 'P2002') {
          sendError(
            res,
            409,
            'ROLE_NAME_TAKEN',
            'An employee with this name already exists for this tenant',
          );
          return;
        }
        logger.error({ err }, 'Failed to create archetype');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.get(
    '/admin/tenants/:tenantId/archetypes/model-questions',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.VIEWER),
    (_req, res) => {
      sendSuccess(res, 200, MODEL_QUESTIONS);
    },
  );

  router.post(
    '/admin/tenants/:tenantId/archetypes/recommend-model',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }

      const bodyResult = RecommendModelBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
        return;
      }

      const { archetype, userAnswers } = bodyResult.data;

      try {
        let profile = analyzeArchetype(archetype);
        if (userAnswers) {
          profile = adjustProfileWithUserAnswers(profile, userAnswers);
        }

        const catalog = await prisma.modelCatalog.findMany({
          where: { deleted_at: null, is_active: true },
        });

        const recommendation = recommendModels(profile, catalog);
        sendSuccess(res, 200, recommendation);
      } catch (err) {
        logger.error({ err }, 'Failed to generate model recommendation');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.patch(
    '/admin/tenants/:tenantId/archetypes/:archetypeId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = ArchetypeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }

      const bodyResult = PatchArchetypeBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;

      try {
        const existing = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId },
        });

        if (!existing) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }

        const {
          risk_model,
          trigger_sources,
          tool_registry,
          overview,
          status,
          input_schema,
          worker_env,
          instructions,
          ...rest
        } = bodyResult.data;

        if (status === 'active') {
          const conflict = await prisma.archetype.findFirst({
            where: {
              tenant_id: tenantId,
              role_name: rest.role_name ?? existing.role_name ?? undefined,
              status: 'active',
              NOT: { id: archetypeId },
            },
          });
          if (conflict) {
            sendError(
              res,
              409,
              'ROLE_NAME_CONFLICT',
              'role_name already taken by an active employee',
            );
            return;
          }
        }

        const updated = await prisma.archetype.update({
          where: { id: archetypeId },
          data: {
            ...rest,
            ...(instructions !== undefined && { execution_instructions: instructions }),
            ...(status !== undefined && { status }),
            ...(risk_model !== undefined && { risk_model: risk_model as Prisma.InputJsonValue }),
            ...(trigger_sources !== undefined && {
              trigger_sources:
                trigger_sources === null
                  ? Prisma.JsonNull
                  : (trigger_sources as Prisma.InputJsonValue),
            }),
            ...(tool_registry !== undefined && {
              tool_registry:
                tool_registry === null ? Prisma.JsonNull : (tool_registry as Prisma.InputJsonValue),
            }),
            ...(overview !== undefined && {
              overview: overview === null ? Prisma.JsonNull : (overview as Prisma.InputJsonValue),
            }),
            ...(input_schema !== undefined && {
              input_schema: input_schema as Prisma.InputJsonValue,
            }),
            ...(worker_env !== undefined && {
              worker_env:
                worker_env === null ? Prisma.JsonNull : (worker_env as Prisma.InputJsonValue),
            }),
          },
        });

        let resultArchetype = updated;
        if (shouldReEstimate(Object.keys(bodyResult.data))) {
          try {
            const estimated = await estimator.estimate(updated);
            if (estimated !== null) {
              const reEstimated = await prisma.archetype.update({
                where: { id: archetypeId },
                data: { estimated_manual_minutes: estimated },
              });
              if (reEstimated) resultArchetype = reEstimated;
            }
          } catch (estimateErr) {
            logger.warn(
              { err: estimateErr },
              'Time re-estimation failed after update — returning archetype without re-estimate',
            );
          }
        }

        sendSuccess(res, 200, resultArchetype);
      } catch (err) {
        logger.error({ err }, 'Failed to update archetype');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/archetypes/:archetypeId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = ArchetypeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }
      const { tenantId, archetypeId } = paramResult.data;
      try {
        const deleted = await repo.softDelete(archetypeId, tenantId);
        sendSuccess(res, 200, { id: deleted.id, deleted_at: deleted.deleted_at });
      } catch (err) {
        if (err instanceof ActiveTasksError) {
          sendError(
            res,
            409,
            'ACTIVE_TASKS',
            `Cannot delete: ${err.activeTaskCount} active task(s)`,
            { activeTaskCount: err.activeTaskCount },
          );
          return;
        }
        if (err instanceof Error && err.message.includes('not found')) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }
        logger.error({ err }, 'Failed to soft-delete archetype');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.post(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/restore',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = ArchetypeParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }
      const { tenantId, archetypeId } = paramResult.data;
      try {
        const restored = await repo.restore(archetypeId, tenantId);
        sendSuccess(res, 200, restored);
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }
        if (err instanceof Error && err.message.includes('role_name')) {
          sendError(
            res,
            409,
            'CONFLICT',
            'An active archetype with the same role_name already exists',
          );
          return;
        }
        logger.error({ err }, 'Failed to restore archetype');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  return router;
}
