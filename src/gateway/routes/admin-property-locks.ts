import { Router } from 'express';
import { PrismaClient, Prisma, TenantRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import {
  CreatePropertyLockSchema,
  UpdatePropertyLockSchema,
  TenantIdParamSchema,
  TenantPropertyLockParamSchema,
} from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('admin-property-locks');

export interface AdminPropertyLockRouteOptions {
  prisma?: PrismaClient;
}

export function adminPropertyLockRoutes(opts: AdminPropertyLockRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  router.post(
    '/admin/tenants/:tenantId/property-locks',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      const result = CreatePropertyLockSchema.safeParse(req.body);
      if (!result.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: result.error.issues,
        });
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
        sendSuccess(res, 201, propertyLock);
      } catch (err) {
        logger.error({ err }, 'Failed to create property lock');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  router.get(
    '/admin/tenants/:tenantId/property-locks',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.VIEWER),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
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
        sendSuccess(res, 200, { propertyLocks });
      } catch (err) {
        logger.error({ err }, 'Failed to list property locks');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  router.get(
    '/admin/tenants/:tenantId/property-locks/:lockId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.VIEWER),
    async (req, res) => {
      const paramResult = TenantPropertyLockParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
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
          sendError(res, 404, ERROR_CODES.NOT_FOUND);
          return;
        }

        sendSuccess(res, 200, propertyLock);
      } catch (err) {
        logger.error({ err }, 'Failed to get property lock');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  router.patch(
    '/admin/tenants/:tenantId/property-locks/:lockId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = TenantPropertyLockParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      const result = UpdatePropertyLockSchema.safeParse(req.body);
      if (!result.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: result.error.issues,
        });
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
          sendError(res, 404, ERROR_CODES.NOT_FOUND);
          return;
        }

        const propertyLock = await prisma.propertyLock.update({
          where: { id: paramResult.data.lockId, tenant_id: paramResult.data.tenantId },
          data: {
            ...result.data,
            lock_metadata: result.data.lock_metadata as Prisma.InputJsonValue | undefined,
          },
        });

        sendSuccess(res, 200, propertyLock);
      } catch (err) {
        logger.error({ err }, 'Failed to update property lock');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/property-locks/:lockId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = TenantPropertyLockParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
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
          sendError(res, 404, ERROR_CODES.NOT_FOUND);
          return;
        }

        await prisma.propertyLock.delete({
          where: { id: paramResult.data.lockId, tenant_id: paramResult.data.tenantId },
        });

        sendSuccess(res, 204);
      } catch (err) {
        logger.error({ err }, 'Failed to delete property lock');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  return router;
}
