import { Router } from 'express';
import pino from 'pino';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantIdParamSchema, InputSchemaSchema } from '../validation/schemas.js';

function isPrismaError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

export interface AdminArchetypesRouteOptions {
  prisma?: PrismaClient;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidField = () =>
  z.string().regex(UUID_REGEX, 'Invalid UUID — expected 8-4-4-4-12 hex format');

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
    system_prompt: z.string().optional(),
    risk_model: z.record(z.string(), z.unknown()).optional(),
    concurrency_limit: z.number().int().positive().optional(),
    notification_channel: z.string().optional(),
    vm_size: z.string().optional(),
    deliverable_type: z.string().optional(),
    agents_md: z.string().min(1).max(50000).optional(),
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
  model: z.enum(['minimax/minimax-m2.7', 'anthropic/claude-haiku-4-5']),
  runtime: z.literal('opencode'),
  instructions: z.string().min(1).max(5000),
  agents_md: z.string().min(1).max(50000),
  system_prompt: z.string().max(10000).default(''),
  delivery_instructions: z.string().max(10000).nullable().default(null),
  deliverable_type: z.string().max(100).nullable().default(null),
  risk_model: z
    .object({
      approval_required: z.boolean(),
      timeout_hours: z.number().positive(),
    })
    .default({ approval_required: false, timeout_hours: 2 }),
  notification_channel: z.string().max(50).nullable().default(null),
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
});

export function adminArchetypesRoutes(opts: AdminArchetypesRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();

  router.post('/admin/tenants/:tenantId/archetypes', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID', issues: paramResult.error.issues });
      return;
    }

    const bodyResult = CreateArchetypeBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
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
      ...rest
    } = bodyResult.data;

    try {
      const newArchetype = await prisma.archetype.create({
        data: {
          ...rest,
          tenant_id: tenantId,
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

      res.status(201).json(newArchetype);
    } catch (err) {
      if (isPrismaError(err) && err.code === 'P2002') {
        res.status(409).json({
          error: 'ROLE_NAME_TAKEN',
          message: 'An employee with this name already exists for this tenant',
        });
        return;
      }
      logger.error({ err }, 'Failed to create archetype');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

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

        const {
          risk_model,
          trigger_sources,
          tool_registry,
          overview,
          status,
          input_schema,
          worker_env,
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
            res.status(409).json({ error: 'role_name already taken by an active employee' });
            return;
          }
        }

        const updated = await prisma.archetype.update({
          where: { id: archetypeId },
          data: {
            ...rest,
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

        res.status(200).json(updated);
      } catch (err) {
        logger.error({ err }, 'Failed to update archetype');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  return router;
}
