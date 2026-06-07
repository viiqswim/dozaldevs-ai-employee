import { Router } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { requireAdminKey } from '../middleware/admin-auth.js';
import {
  CreatePropertyLockSchema,
  UpdatePropertyLockSchema,
  TenantIdParamSchema,
  TenantPropertyLockParamSchema,
} from '../validation/schemas.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('admin-property-locks');

export interface AdminPropertyLockRouteOptions {
  prisma?: PrismaClient;
}

export function adminPropertyLockRoutes(opts: AdminPropertyLockRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  router.post('/admin/tenants/:tenantId/property-locks', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    const result = CreatePropertyLockSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: result.error.issues });
      return;
    }

    try {
      const propertyLock = await prisma.propertyLock.create({
        data: {
          ...result.data,
          lock_metadata: result.data.lock_metadata as Prisma.InputJsonValue | undefined,
          tenant_id: paramResult.data.tenantId,
        },
      });
      res.status(201).json(propertyLock);
    } catch (err) {
      logger.error({ err }, 'Failed to create property lock');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/admin/tenants/:tenantId/property-locks', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    const propertyId = req.query.property_id as string | undefined;

    try {
      const propertyLocks = await prisma.propertyLock.findMany({
        where: {
          tenant_id: paramResult.data.tenantId,
          ...(propertyId ? { property_external_id: propertyId } : {}),
        },
        orderBy: { created_at: 'asc' },
      });
      res.status(200).json({ propertyLocks });
    } catch (err) {
      logger.error({ err }, 'Failed to list property locks');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get(
    '/admin/tenants/:tenantId/property-locks/:lockId',
    requireAdminKey,
    async (req, res) => {
      const paramResult = TenantPropertyLockParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'INVALID_ID' });
        return;
      }

      try {
        const propertyLock = await prisma.propertyLock.findFirst({
          where: {
            id: paramResult.data.lockId,
            tenant_id: paramResult.data.tenantId,
          },
        });

        if (!propertyLock) {
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }

        res.status(200).json(propertyLock);
      } catch (err) {
        logger.error({ err }, 'Failed to get property lock');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  router.patch(
    '/admin/tenants/:tenantId/property-locks/:lockId',
    requireAdminKey,
    async (req, res) => {
      const paramResult = TenantPropertyLockParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'INVALID_ID' });
        return;
      }

      const result = UpdatePropertyLockSchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: result.error.issues });
        return;
      }

      try {
        const existing = await prisma.propertyLock.findFirst({
          where: {
            id: paramResult.data.lockId,
            tenant_id: paramResult.data.tenantId,
          },
        });

        if (!existing) {
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }

        const propertyLock = await prisma.propertyLock.update({
          where: { id: paramResult.data.lockId, tenant_id: paramResult.data.tenantId },
          data: {
            ...result.data,
            lock_metadata: result.data.lock_metadata as Prisma.InputJsonValue | undefined,
          },
        });

        res.status(200).json(propertyLock);
      } catch (err) {
        logger.error({ err }, 'Failed to update property lock');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/property-locks/:lockId',
    requireAdminKey,
    async (req, res) => {
      const paramResult = TenantPropertyLockParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'INVALID_ID' });
        return;
      }

      try {
        const existing = await prisma.propertyLock.findFirst({
          where: {
            id: paramResult.data.lockId,
            tenant_id: paramResult.data.tenantId,
          },
        });

        if (!existing) {
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }

        await prisma.propertyLock.delete({
          where: { id: paramResult.data.lockId, tenant_id: paramResult.data.tenantId },
        });

        res.status(204).send();
      } catch (err) {
        logger.error({ err }, 'Failed to delete property lock');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  return router;
}
