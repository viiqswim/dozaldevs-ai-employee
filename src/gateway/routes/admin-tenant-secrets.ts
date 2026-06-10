import { Router } from 'express';
import { createLogger } from '../../lib/logger.js';
import { PrismaClient, TenantRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { TenantRepository } from '../../repositories/tenant-repository.js';
import { TenantSecretRepository } from '../../repositories/tenant-secret-repository.js';
import {
  TenantIdParamSchema,
  SecretKeyParamSchema,
  SetSecretBodySchema,
} from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

export interface AdminTenantSecretsRouteOptions {
  prisma?: PrismaClient;
}

export function adminTenantSecretsRoutes(opts: AdminTenantSecretsRouteOptions = {}): Router {
  const router = Router();
  const logger = createLogger('admin-tenant-secrets');
  const prisma = opts.prisma ?? new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);

  router.get(
    '/admin/tenants/:tenantId/secrets',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.OWNER),
    async (req, res) => {
      const paramResult = TenantIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_ID');
        return;
      }
      try {
        const tenant = await tenantRepo.findById(paramResult.data.tenantId);
        if (!tenant) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }
        const secrets = await secretRepo.listKeys(paramResult.data.tenantId);
        sendSuccess(res, 200, { secrets });
      } catch (err) {
        logger.error({ err }, 'Failed to list secrets');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.put(
    '/admin/tenants/:tenantId/secrets/:key',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.OWNER),
    async (req, res) => {
      const paramResult = SecretKeyParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_PARAMS', undefined, { issues: paramResult.error.issues });
        return;
      }
      const bodyResult = SetSecretBodySchema.safeParse(req.body);
      if (!bodyResult.success) {
        sendError(res, 400, 'INVALID_REQUEST', undefined, { issues: bodyResult.error.issues });
        return;
      }
      try {
        const tenant = await tenantRepo.findById(paramResult.data.tenantId);
        if (!tenant) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }
        const meta = await secretRepo.set(
          paramResult.data.tenantId,
          paramResult.data.key,
          bodyResult.data.value,
        );
        sendSuccess(res, 200, meta);
      } catch (err) {
        logger.error({ err }, 'Failed to set secret');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/secrets/:key',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.OWNER),
    async (req, res) => {
      const paramResult = SecretKeyParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, 'INVALID_PARAMS');
        return;
      }
      try {
        const tenant = await tenantRepo.findById(paramResult.data.tenantId);
        if (!tenant) {
          sendError(res, 404, 'NOT_FOUND');
          return;
        }
        const deleted = await secretRepo.delete(paramResult.data.tenantId, paramResult.data.key);
        if (!deleted) {
          sendError(res, 404, 'SECRET_NOT_FOUND');
          return;
        }
        sendSuccess(res, 204);
      } catch (err) {
        logger.error({ err }, 'Failed to delete secret');
        sendError(res, 500, 'INTERNAL_ERROR');
      }
    },
  );

  return router;
}
