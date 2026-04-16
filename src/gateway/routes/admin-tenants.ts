import { Router } from 'express';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantRepository } from '../services/tenant-repository.js';
import {
  CreateTenantBodySchema,
  UpdateTenantBodySchema,
  TenantIdParamSchema,
} from '../validation/schemas.js';

export interface AdminTenantsRouteOptions {
  prisma?: PrismaClient;
}

export function adminTenantsRoutes(opts: AdminTenantsRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();
  const repo = new TenantRepository(prisma);

  router.post('/admin/tenants', requireAdminKey, async (req, res) => {
    const parsed = CreateTenantBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: parsed.error.issues });
      return;
    }
    try {
      const tenant = await repo.create({
        name: parsed.data.name,
        slug: parsed.data.slug,
        config: parsed.data.config as Prisma.InputJsonValue | undefined,
      });
      res.status(201).json({
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        status: tenant.status,
        install_link: `/slack/install?tenant=${tenant.id}`,
        created_at: tenant.created_at,
      });
    } catch (err) {
      if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
        res.status(409).json({ error: 'CONFLICT', message: 'Slug already taken' });
        return;
      }
      logger.error({ err }, 'Failed to create tenant');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/admin/tenants', requireAdminKey, async (req, res) => {
    const includeDeleted = req.query['include_deleted'] === 'true';
    try {
      const tenants = await repo.list({ includeDeleted });
      res.status(200).json({ tenants });
    } catch (err) {
      logger.error({ err }, 'Failed to list tenants');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/admin/tenants/:tenantId', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }
    const includeDeleted = req.query['include_deleted'] === 'true';
    try {
      const tenant = includeDeleted
        ? await prisma.tenant.findUnique({ where: { id: paramResult.data.tenantId } })
        : await repo.findById(paramResult.data.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.status(200).json(tenant);
    } catch (err) {
      logger.error({ err }, 'Failed to get tenant');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.patch('/admin/tenants/:tenantId', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }
    const bodyResult = UpdateTenantBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
      return;
    }
    try {
      const existing = await repo.findById(paramResult.data.tenantId);
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const updated = await repo.update(paramResult.data.tenantId, {
        name: bodyResult.data.name,
        status: bodyResult.data.status,
        config: bodyResult.data.config as Prisma.InputJsonValue | undefined,
      });
      res.status(200).json(updated);
    } catch (err) {
      logger.error({ err }, 'Failed to update tenant');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.delete('/admin/tenants/:tenantId', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }
    try {
      const existing = await repo.findById(paramResult.data.tenantId);
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const deleted = await repo.softDelete(paramResult.data.tenantId);
      res.status(200).json({ id: deleted.id, deleted_at: deleted.deleted_at });
    } catch (err) {
      logger.error({ err }, 'Failed to soft-delete tenant');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.post('/admin/tenants/:tenantId/restore', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }
    try {
      const restored = await repo.restore(paramResult.data.tenantId);
      res.status(200).json(restored);
    } catch (err) {
      if (err instanceof Error && err.message.includes('not found')) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      if (err instanceof Error && err.message.includes('slug')) {
        res.status(409).json({ error: 'CONFLICT', message: err.message });
        return;
      }
      logger.error({ err }, 'Failed to restore tenant');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
