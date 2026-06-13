import { Router } from 'express';
import { PrismaClient, Prisma, TenantRole } from '@prisma/client';
import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantIdParamSchema, uuidField } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

export interface AdminArchetypeEditHistoryRouteOptions {
  prisma?: PrismaClient;
}

const EditHistoryParamSchema = TenantIdParamSchema.extend({
  archetypeId: uuidField(),
});

const RecordEditHistoryBodySchema = z.object({
  request_text: z.string(),
  before_json: z.record(z.string(), z.unknown()),
  after_json: z.record(z.string(), z.unknown()),
  changed_fields: z.array(z.string()),
  kind: z.enum(['edit', 'revert']),
});

const ListEditHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const RevertParamSchema = EditHistoryParamSchema.extend({
  historyId: uuidField(),
});

const DEFAULT_LIMIT = 50;

// Security boundary: revert only restores content fields. model, temperature,
// role_name, vm_size, concurrency_limit are operational settings and MUST never
// be restored. risk_model is narrowed to approval_required; tool_registry to tools.
function extractAllowlistedFields(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('identity' in source) out.identity = source.identity;
  if ('execution_steps' in source) out.execution_steps = source.execution_steps;
  if ('delivery_steps' in source) out.delivery_steps = source.delivery_steps;
  if ('overview' in source) out.overview = source.overview;
  if ('risk_model' in source && source.risk_model && typeof source.risk_model === 'object') {
    out.risk_model = {
      approval_required: Boolean((source.risk_model as Record<string, unknown>).approval_required),
    };
  }
  if (
    'tool_registry' in source &&
    source.tool_registry &&
    typeof source.tool_registry === 'object'
  ) {
    const tools = (source.tool_registry as Record<string, unknown>).tools;
    out.tool_registry = { tools: Array.isArray(tools) ? (tools as string[]) : [] };
  }
  if ('trigger_sources' in source) out.trigger_sources = source.trigger_sources;
  if ('input_schema' in source) out.input_schema = source.input_schema;
  return out;
}

function buildRevertUpdateData(
  restored: Record<string, unknown>,
  currentRiskModel: Record<string, unknown>,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if ('identity' in restored) data.identity = restored.identity;
  if ('execution_steps' in restored) data.execution_steps = restored.execution_steps;
  if ('delivery_steps' in restored) data.delivery_steps = restored.delivery_steps;
  if ('overview' in restored) {
    data.overview =
      restored.overview === null ? Prisma.JsonNull : (restored.overview as Prisma.InputJsonValue);
  }
  if ('risk_model' in restored) {
    const approvalRequired = Boolean(
      (restored.risk_model as Record<string, unknown>).approval_required,
    );
    data.risk_model = {
      ...currentRiskModel,
      approval_required: approvalRequired,
    } as Prisma.InputJsonValue;
  }
  if ('tool_registry' in restored) {
    data.tool_registry = restored.tool_registry as Prisma.InputJsonValue;
  }
  if ('trigger_sources' in restored) {
    data.trigger_sources =
      restored.trigger_sources === null
        ? Prisma.JsonNull
        : (restored.trigger_sources as Prisma.InputJsonValue);
  }
  if ('input_schema' in restored) {
    data.input_schema =
      restored.input_schema === null
        ? Prisma.JsonNull
        : (restored.input_schema as Prisma.InputJsonValue);
  }
  return data;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function adminArchetypeEditHistoryRoutes(
  opts: AdminArchetypeEditHistoryRouteOptions = {},
): Router {
  const router = Router();
  const logger = createLogger('admin-archetype-edit-history');
  const prisma = opts.prisma ?? new PrismaClient();

  router.post(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/edit-history',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = EditHistoryParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }

      const bodyResult = RecordEditHistoryBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;
      const { request_text, before_json, after_json, changed_fields, kind } = bodyResult.data;

      try {
        const archetype = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId, deleted_at: null },
        });
        if (!archetype) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }

        const actorUserId = req.auth?.id ?? null;

        const created = await prisma.archetypeEditHistory.create({
          data: {
            archetype_id: archetypeId,
            tenant_id: tenantId,
            request_text,
            before_json: before_json as Prisma.InputJsonValue,
            after_json: after_json as Prisma.InputJsonValue,
            changed_fields: changed_fields as Prisma.InputJsonValue,
            kind,
            actor_user_id: actorUserId,
          },
        });

        sendSuccess(res, 201, created);
      } catch (err) {
        logger.error({ err }, 'Failed to record archetype edit history');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.get(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/edit-history',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = EditHistoryParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }

      const queryResult = ListEditHistoryQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: queryResult.error.issues });
        return;
      }

      const { tenantId, archetypeId } = paramResult.data;
      const limit = queryResult.data.limit ?? DEFAULT_LIMIT;

      try {
        const rows = await prisma.archetypeEditHistory.findMany({
          where: { tenant_id: tenantId, archetype_id: archetypeId, deleted_at: null },
          orderBy: { created_at: 'desc' },
          take: limit,
        });

        sendSuccess(res, 200, rows);
      } catch (err) {
        logger.error({ err }, 'Failed to list archetype edit history');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.post(
    '/admin/tenants/:tenantId/archetypes/:archetypeId/edit-history/:historyId/revert',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = RevertParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }

      const { tenantId, archetypeId, historyId } = paramResult.data;

      try {
        const target = await prisma.archetypeEditHistory.findFirst({
          where: {
            id: historyId,
            archetype_id: archetypeId,
            tenant_id: tenantId,
            deleted_at: null,
          },
        });
        if (!target) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }

        const current = await prisma.archetype.findFirst({
          where: { id: archetypeId, tenant_id: tenantId, deleted_at: null },
        });
        if (!current) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }

        const currentRecord = current as unknown as Record<string, unknown>;
        const beforeSnapshot = extractAllowlistedFields(currentRecord);
        const restored = extractAllowlistedFields(
          (target.before_json ?? {}) as Record<string, unknown>,
        );

        const changedFields = Object.keys(restored).filter(
          (field) => !deepEqual(beforeSnapshot[field], restored[field]),
        );

        const currentRiskModel =
          currentRecord.risk_model && typeof currentRecord.risk_model === 'object'
            ? (currentRecord.risk_model as Record<string, unknown>)
            : {};
        const updateData = buildRevertUpdateData(restored, currentRiskModel);

        const updatedArchetype = await prisma.archetype.update({
          where: { id: archetypeId },
          data: updateData as never,
        });

        const actorUserId = req.auth?.id ?? null;
        const targetCreatedAt =
          target.created_at instanceof Date
            ? target.created_at.toISOString()
            : String(target.created_at);

        const newHistoryRow = await prisma.archetypeEditHistory.create({
          data: {
            archetype_id: archetypeId,
            tenant_id: tenantId,
            request_text: `Revert to change from ${targetCreatedAt}`,
            before_json: beforeSnapshot as Prisma.InputJsonValue,
            after_json: restored as Prisma.InputJsonValue,
            changed_fields: changedFields as Prisma.InputJsonValue,
            kind: 'revert',
            actor_user_id: actorUserId,
          },
        });

        sendSuccess(res, 200, { archetype: updatedArchetype, history: newHistoryRow });
      } catch (err) {
        logger.error({ err }, 'Failed to revert archetype edit history');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  return router;
}
