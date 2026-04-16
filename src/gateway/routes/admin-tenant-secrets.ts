import { Router } from 'express';
import pino from 'pino';
import { PrismaClient } from '@prisma/client';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { TenantRepository } from '../services/tenant-repository.js';
import { TenantSecretRepository } from '../services/tenant-secret-repository.js';
import {
  TenantIdParamSchema,
  SecretKeyParamSchema,
  SetSecretBodySchema,
} from '../validation/schemas.js';

export interface AdminTenantSecretsRouteOptions {
  prisma?: PrismaClient;
}

export function adminTenantSecretsRoutes(opts: AdminTenantSecretsRouteOptions = {}): Router {
  const router = Router();
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = opts.prisma ?? new PrismaClient();
  const tenantRepo = new TenantRepository(prisma);
  const secretRepo = new TenantSecretRepository(prisma);

  router.get('/admin/tenants/:tenantId/secrets', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }
    try {
      const tenant = await tenantRepo.findById(paramResult.data.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const secrets = await secretRepo.listKeys(paramResult.data.tenantId);
      res.status(200).json({ secrets });
    } catch (err) {
      logger.error({ err }, 'Failed to list secrets');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.put('/admin/tenants/:tenantId/secrets/:key', requireAdminKey, async (req, res) => {
    const paramResult = SecretKeyParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_PARAMS', issues: paramResult.error.issues });
      return;
    }
    const bodyResult = SetSecretBodySchema.safeParse(req.body);
    if (!bodyResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: bodyResult.error.issues });
      return;
    }
    try {
      const tenant = await tenantRepo.findById(paramResult.data.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const meta = await secretRepo.set(
        paramResult.data.tenantId,
        paramResult.data.key,
        bodyResult.data.value,
      );
      res.status(200).json(meta);
    } catch (err) {
      logger.error({ err }, 'Failed to set secret');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.delete('/admin/tenants/:tenantId/secrets/:key', requireAdminKey, async (req, res) => {
    const paramResult = SecretKeyParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_PARAMS' });
      return;
    }
    try {
      const tenant = await tenantRepo.findById(paramResult.data.tenantId);
      if (!tenant) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }
      const deleted = await secretRepo.delete(paramResult.data.tenantId, paramResult.data.key);
      if (!deleted) {
        res.status(404).json({ error: 'SECRET_NOT_FOUND' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      logger.error({ err }, 'Failed to delete secret');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
