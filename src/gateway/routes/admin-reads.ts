import { Router } from 'express';
import { PrismaClient, Prisma, TenantRole } from '@prisma/client';
import { z } from 'zod';
import { createLogger } from '../../lib/logger.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantIdParamSchema, uuidField } from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

const logger = createLogger('admin-reads');

export interface AdminReadsRouteOptions {
  prisma?: PrismaClient;
}

const TaskSubParamSchema = z.object({
  tenantId: uuidField(),
  taskId: uuidField(),
});

function strParam(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseLimit(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function parseDirection(value: unknown): 'asc' | 'desc' {
  return typeof value === 'string' && value.endsWith('.asc') ? 'asc' : 'desc';
}

const TASK_ARCHETYPE_SELECT = {
  role_name: true,
  model: true,
  input_schema: true,
} satisfies Prisma.ArchetypeSelect;

const TASK_EXECUTION_SELECT = {
  estimated_cost_usd: true,
  phase: true,
  primary_model_id: true,
} satisfies Prisma.ExecutionSelect;

const TASK_INCLUDE = {
  archetype: { select: TASK_ARCHETYPE_SELECT },
  executions: { select: TASK_EXECUTION_SELECT },
} satisfies Prisma.TaskInclude;

type TaskWithEmbeds = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

// PostgREST embeds a to-one relation under the target table name (`archetypes`), while
// Prisma exposes it under the singular relation name (`archetype`). Remap so the response
// matches the shape the dashboard already reads from PostgREST.
function remapTask({ archetype, ...rest }: TaskWithEmbeds) {
  return { ...rest, archetypes: archetype };
}

/**
 * Tenant-scoped read endpoints that replace the dashboard's direct PostgREST reads.
 *
 * Under the opaque Supabase key model, `Bearer sb_publishable_*` is rejected by
 * PostgREST, so all dashboard reads route through the gateway (server-side Prisma).
 * Every endpoint requires authentication and tenant membership (minimum VIEWER role).
 *
 * IMPORTANT — registration order: this router MUST be registered BEFORE
 * `adminTasksRoutes` in `server.ts`. Both define `GET /admin/tenants/:tenantId/tasks/:id`;
 * the richer detail handler here (with `archetypes`/`executions` embeds) must take
 * precedence. The SSE `/tasks/:id/logs` route has a different segment count and still
 * resolves to `adminTasksRoutes`.
 */
export function adminReadsRoutes(opts: AdminReadsRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  const guards = [authMiddleware, requireAuth, requireTenantRole(TenantRole.VIEWER)];

  // ─── Tasks ──────────────────────────────────────────────────────────────────

  router.get('/admin/tenants/:tenantId/tasks', ...guards, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId } = paramResult.data;
    const status = strParam(req.query.status);
    const limit = parseLimit(req.query.limit);
    const direction = parseDirection(req.query.order);

    try {
      const tasks = await prisma.task.findMany({
        where: { tenant_id: tenantId, deleted_at: null, ...(status ? { status } : {}) },
        include: TASK_INCLUDE,
        orderBy: { created_at: direction },
        ...(limit ? { take: limit } : {}),
      });
      sendSuccess(res, 200, tasks.map(remapTask));
    } catch (err) {
      logger.error({ err }, 'Failed to list tasks');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.get('/admin/tenants/:tenantId/tasks/:taskId', ...guards, async (req, res) => {
    const paramResult = TaskSubParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId, taskId } = paramResult.data;

    try {
      const task = await prisma.task.findFirst({
        where: { id: taskId, tenant_id: tenantId, deleted_at: null },
        include: TASK_INCLUDE,
      });
      if (!task) {
        sendError(res, 404, 'NOT_FOUND');
        return;
      }
      sendSuccess(res, 200, remapTask(task));
    } catch (err) {
      logger.error({ err }, 'Failed to get task');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.get('/admin/tenants/:tenantId/tasks/:taskId/status-log', ...guards, async (req, res) => {
    const paramResult = TaskSubParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId, taskId } = paramResult.data;
    const limit = parseLimit(req.query.limit);

    try {
      const logs = await prisma.taskStatusLog.findMany({
        where: { task: { id: taskId, tenant_id: tenantId } },
        orderBy: { created_at: 'asc' },
        ...(limit ? { take: limit } : {}),
      });
      sendSuccess(res, 200, logs);
    } catch (err) {
      logger.error({ err }, 'Failed to list task status log');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.get(
    '/admin/tenants/:tenantId/tasks/:taskId/pending-approval',
    ...guards,
    async (req, res) => {
      const paramResult = TaskSubParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
        return;
      }
      const { tenantId, taskId } = paramResult.data;

      try {
        const approvals = await prisma.pendingApproval.findMany({
          where: { task_id: taskId, tenant_id: tenantId, deleted_at: null },
          orderBy: { created_at: 'desc' },
        });
        sendSuccess(res, 200, approvals);
      } catch (err) {
        logger.error({ err }, 'Failed to get pending approval');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  // ─── Archetypes ───────────────────────────────────────────────────────────────

  router.get('/admin/tenants/:tenantId/archetypes', ...guards, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId } = paramResult.data;
    const id = strParam(req.query.id);
    const limit = parseLimit(req.query.limit);

    try {
      const archetypes = await prisma.archetype.findMany({
        where: { tenant_id: tenantId, deleted_at: null, ...(id ? { id } : {}) },
        orderBy: { created_at: 'desc' },
        ...(limit ? { take: limit } : {}),
      });
      sendSuccess(res, 200, archetypes);
    } catch (err) {
      logger.error({ err }, 'Failed to list archetypes');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  // ─── Employee rules ─────────────────────────────────────────────────────────

  router.get('/admin/tenants/:tenantId/employee-rules', ...guards, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId } = paramResult.data;
    const archetypeId = strParam(req.query.archetype_id);
    const limit = parseLimit(req.query.limit);

    try {
      const rules = await prisma.employeeRule.findMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
          ...(archetypeId ? { archetype_id: archetypeId } : {}),
        },
        orderBy: { created_at: 'desc' },
        ...(limit ? { take: limit } : {}),
      });
      sendSuccess(res, 200, rules);
    } catch (err) {
      logger.error({ err }, 'Failed to list employee rules');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  // ─── Feedback events ──────────────────────────────────────────────────────────

  router.get('/admin/tenants/:tenantId/feedback-events', ...guards, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId } = paramResult.data;
    const archetypeId = strParam(req.query.archetype_id);
    const limit = parseLimit(req.query.limit);

    try {
      const events = await prisma.feedbackEvent.findMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
          ...(archetypeId ? { archetype_id: archetypeId } : {}),
        },
        orderBy: { created_at: 'desc' },
        ...(limit ? { take: limit } : {}),
      });
      sendSuccess(res, 200, events);
    } catch (err) {
      logger.error({ err }, 'Failed to list feedback events');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  // ─── Task metrics ─────────────────────────────────────────────────────────────

  router.get('/admin/tenants/:tenantId/task-metrics', ...guards, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId } = paramResult.data;
    const limit = parseLimit(req.query.limit);

    try {
      const metrics = await prisma.taskMetric.findMany({
        where: { tenant_id: tenantId, deleted_at: null },
        orderBy: { created_at: 'desc' },
        ...(limit ? { take: limit } : {}),
      });
      sendSuccess(res, 200, metrics);
    } catch (err) {
      logger.error({ err }, 'Failed to list task metrics');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  // ─── Tenant integrations ──────────────────────────────────────────────────────

  router.get('/admin/tenants/:tenantId/integrations', ...guards, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId } = paramResult.data;
    const provider = strParam(req.query.provider);

    try {
      const integrations = await prisma.tenantIntegration.findMany({
        where: { tenant_id: tenantId, deleted_at: null, ...(provider ? { provider } : {}) },
        orderBy: { created_at: 'desc' },
      });
      sendSuccess(res, 200, integrations);
    } catch (err) {
      logger.error({ err }, 'Failed to list tenant integrations');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  // ─── Deliverables ─────────────────────────────────────────────────────────────
  // `deliverables` has no tenant_id/task_id column; scope via execution → task → tenant.
  // The `?task_id=` query maps to `external_ref` (which holds the task id).

  router.get('/admin/tenants/:tenantId/deliverables', ...guards, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId } = paramResult.data;
    const taskId = strParam(req.query.task_id);
    const limit = parseLimit(req.query.limit);

    try {
      const deliverables = await prisma.deliverable.findMany({
        where: {
          execution: { task: { tenant_id: tenantId } },
          ...(taskId ? { external_ref: taskId } : {}),
        },
        orderBy: { created_at: 'desc' },
        ...(limit ? { take: limit } : {}),
      });
      sendSuccess(res, 200, deliverables);
    } catch (err) {
      logger.error({ err }, 'Failed to list deliverables');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  // ─── Executions ───────────────────────────────────────────────────────────────
  // `executions` has no tenant_id; scope via task → tenant. The heavy
  // `session_transcript` field is included only for a single-execution lookup (`?id=`),
  // matching the dashboard's lean default select.

  router.get('/admin/tenants/:tenantId/executions', ...guards, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID', undefined, { issues: paramResult.error.issues });
      return;
    }
    const { tenantId } = paramResult.data;
    const taskId = strParam(req.query.task_id);
    const id = strParam(req.query.id);
    const limit = parseLimit(req.query.limit);

    const select: Prisma.ExecutionSelect = {
      id: true,
      task_id: true,
      runtime_type: true,
      status: true,
      prompt_tokens: true,
      completion_tokens: true,
      estimated_cost_usd: true,
      phase: true,
      heartbeat_at: true,
      current_stage: true,
      created_at: true,
      updated_at: true,
    };
    if (id) select.session_transcript = true;

    try {
      const executions = await prisma.execution.findMany({
        where: {
          task: { tenant_id: tenantId },
          deleted_at: null,
          ...(taskId ? { task_id: taskId } : {}),
          ...(id ? { id } : {}),
        },
        select,
        orderBy: { created_at: 'desc' },
        ...(limit ? { take: limit } : {}),
      });
      sendSuccess(res, 200, executions);
    } catch (err) {
      logger.error({ err }, 'Failed to list executions');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}
