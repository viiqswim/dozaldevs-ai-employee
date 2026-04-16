import { Router } from 'express';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantRepository } from '../services/tenant-repository.js';
import { TenantIdParamSchema, TenantConfigBodySchema } from '../validation/schemas.js';

export interface AdminTenantConfigRouteOptions {
  prisma?: PrismaClient;
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (
      srcVal !== null &&
      typeof srcVal === 'object' &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === 'object' &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(tgtVal as Record<string, unknown>, srcVal as Record<string, unknown>);
    } else {
      result[key] = srcVal;
    }
  }
  return result;
}

export function adminTenantConfigRoutes(opts: AdminTenantConfigRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();
  const repo = new TenantRepository(prisma);

  router.get('/admin/tenants/:tenantId/config', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }
    try {
      const tenant = await repo.findById(paramResult.data.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      res.status(200).json(tenant.config ?? {});
    } catch (err) {
      logger.error({ err }, 'Failed to get config');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.patch('/admin/tenants/:tenantId/config', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }
    const bodyResult = TenantConfigBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
      return;
    }
    try {
      const tenant = await repo.findById(paramResult.data.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const existing =
        tenant.config !== null && typeof tenant.config === 'object' && !Array.isArray(tenant.config)
          ? (tenant.config as Record<string, unknown>)
          : {};
      const merged = deepMerge(existing, bodyResult.data as Record<string, unknown>);
      const updated = await repo.update(paramResult.data.tenantId, {
        config: merged as Prisma.InputJsonValue,
      });
      res.status(200).json(updated.config ?? {});
    } catch (err) {
      logger.error({ err }, 'Failed to update config');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
