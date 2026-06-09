import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantRepository } from '../../repositories/tenant-repository.js';
import {
  CreateTenantBodySchema,
  UpdateTenantBodySchema,
  TenantIdParamSchema,
} from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

export interface AdminTenantsRouteOptions {
  prisma?: PrismaClient;
}

export function adminTenantsRoutes(opts: AdminTenantsRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('admin-tenants');
  const prisma = opts.prisma ?? new PrismaClient();
  const repo = new TenantRepository(prisma);

  router.post('/admin/tenants', requireAdminKey, async (req, res) => {
    const parsed = CreateTenantBodySchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: parsed.error.issues });
      return;
    }
    try {
      const tenant = await repo.create({
        name: parsed.data.name,
        slug: parsed.data.slug,
        config: parsed.data.config as Prisma.InputJsonValue | undefined,
      });
      sendSuccess(res, 201, {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        install_link: `/slack/install?tenant=${tenant.id}`,
        created_at: tenant.created_at,
      });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
        sendError(res, 409, 'CONFLICT', 'Slug already taken');
        return;
      }
      logger.error({ err }, 'Failed to create tenant');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.get('/admin/tenants', requireAdminKey, async (req, res) => {
    const includeDeleted = req.query['include_deleted'] === 'true';
    try {
      const tenants = await repo.list({ includeDeleted });
      sendSuccess(res, 200, { tenants });
    } catch (err) {
      logger.error({ err }, 'Failed to list tenants');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.get('/admin/tenants/:tenantId', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID');
      return;
    }
    const includeDeleted = req.query['include_deleted'] === 'true';
    try {
      const tenant = includeDeleted
        ? await prisma.tenant.findUnique({ where: { id: paramResult.data.tenantId } })
        : await repo.findById(paramResult.data.tenantId);
      if (!tenant) {
        sendError(res, 404, 'NOT_FOUND');
        return;
      }
      sendSuccess(res, 200, tenant);
    } catch (err) {
      logger.error({ err }, 'Failed to get tenant');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.patch('/admin/tenants/:tenantId', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID');
      return;
    }
    const bodyResult = UpdateTenantBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
      return;
    }
    try {
      const existing = await repo.findById(paramResult.data.tenantId);
      if (!existing) {
        sendError(res, 404, 'NOT_FOUND');
        return;
      }
      const updated = await repo.update(paramResult.data.tenantId, {
        name: bodyResult.data.name,
        status: bodyResult.data.status,
        config: bodyResult.data.config as Prisma.InputJsonValue | undefined,
      });
      sendSuccess(res, 200, updated);
    } catch (err) {
      logger.error({ err }, 'Failed to update tenant');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.delete('/admin/tenants/:tenantId', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID');
      return;
    }
    try {
      const existing = await repo.findById(paramResult.data.tenantId);
      if (!existing) {
        sendError(res, 404, 'NOT_FOUND');
        return;
      }
      const deleted = await repo.softDelete(paramResult.data.tenantId);
      sendSuccess(res, 200, { id: deleted.id, deleted_at: deleted.deleted_at });
    } catch (err) {
      logger.error({ err }, 'Failed to soft-delete tenant');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  router.post('/admin/tenants/:tenantId/restore', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, 'INVALID_ID');
      return;
    }
    try {
      const restored = await repo.restore(paramResult.data.tenantId);
      sendSuccess(res, 200, restored);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        sendError(res, 404, 'NOT_FOUND');
        return;
      }
      if (err instanceof Error && err.message.includes('slug')) {
        sendError(res, 409, 'CONFLICT', err.message);
        return;
      }
      logger.error({ err }, 'Failed to restore tenant');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}
