import { Router } from 'express';
import { PrismaClient, TenantRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import {
  createKbEntry,
  listKbEntries,
  getKbEntry,
  updateKbEntry,
  deleteKbEntry,
  KbEntryConflictError,
} from '../services/kb-repository.js';
import {
  CreateKbEntrySchema,
  UpdateKbEntrySchema,
  ListKbEntriesQuerySchema,
  KbEntryIdParamSchema,
  KbEntryTenantParamSchema,
} from '../validation/schemas.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('admin-kb');

export interface AdminKbRouteOptions {
  prisma?: PrismaClient;
}

export function adminKbRoutes(opts: AdminKbRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  // POST /admin/tenants/:tenantId/kb/entries — Create KB entry
  router.post(
    '/admin/tenants/:tenantId/kb/entries',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = KbEntryTenantParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      const result = CreateKbEntrySchema.safeParse(req.body);
      if (!result.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: result.error.issues,
        });
        return;
      }

      try {
        const entry = await createKbEntry({
          tenantId: paramResult.data.tenantId,
          entityType: result.data.entity_type,
          entityId: result.data.entity_id,
          content: result.data.content,
          prisma,
        });
        sendSuccess(res, 201, entry);
      } catch (err) {
        if (err instanceof KbEntryConflictError) {
          sendError(res, 409, 'CONFLICT', (err as Error).message);
          return;
        }
        logger.error({ err }, 'Failed to create KB entry');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  // GET /admin/tenants/:tenantId/kb/entries — List KB entries (with optional filters)
  router.get(
    '/admin/tenants/:tenantId/kb/entries',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.VIEWER),
    async (req, res) => {
      const paramResult = KbEntryTenantParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      const queryResult = ListKbEntriesQuerySchema.safeParse(req.query);
      if (!queryResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: queryResult.error.issues,
        });
        return;
      }

      try {
        const entries = await listKbEntries({
          tenantId: paramResult.data.tenantId,
          entityType: queryResult.data.entity_type,
          entityId: queryResult.data.entity_id,
          prisma,
        });
        sendSuccess(res, 200, { entries });
      } catch (err) {
        logger.error({ err }, 'Failed to list KB entries');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  // GET /admin/tenants/:tenantId/kb/entries/:entryId — Get single KB entry
  router.get(
    '/admin/tenants/:tenantId/kb/entries/:entryId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.VIEWER),
    async (req, res) => {
      const paramResult = KbEntryIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      try {
        const entry = await getKbEntry({
          tenantId: paramResult.data.tenantId,
          entryId: paramResult.data.entryId,
          prisma,
        });

        if (!entry) {
          sendError(res, 404, ERROR_CODES.NOT_FOUND);
          return;
        }

        sendSuccess(res, 200, entry);
      } catch (err) {
        logger.error({ err }, 'Failed to get KB entry');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  // PATCH /admin/tenants/:tenantId/kb/entries/:entryId — Update KB entry content
  router.patch(
    '/admin/tenants/:tenantId/kb/entries/:entryId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = KbEntryIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      const result = UpdateKbEntrySchema.safeParse(req.body);
      if (!result.success) {
        sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, {
          issues: result.error.issues,
        });
        return;
      }

      try {
        const { count, entry } = await updateKbEntry({
          tenantId: paramResult.data.tenantId,
          entryId: paramResult.data.entryId,
          content: result.data.content,
          prisma,
        });

        if (count === 0 || !entry) {
          sendError(res, 404, ERROR_CODES.NOT_FOUND);
          return;
        }

        sendSuccess(res, 200, entry);
      } catch (err) {
        logger.error({ err }, 'Failed to update KB entry');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  // DELETE /admin/tenants/:tenantId/kb/entries/:entryId — Delete KB entry
  router.delete(
    '/admin/tenants/:tenantId/kb/entries/:entryId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN),
    async (req, res) => {
      const paramResult = KbEntryIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        sendError(res, 400, ERROR_CODES.INVALID_ID);
        return;
      }

      try {
        const { count } = await deleteKbEntry({
          tenantId: paramResult.data.tenantId,
          entryId: paramResult.data.entryId,
          prisma,
        });

        if (count === 0) {
          sendError(res, 404, ERROR_CODES.NOT_FOUND);
          return;
        }

        sendSuccess(res, 204);
      } catch (err) {
        logger.error({ err }, 'Failed to delete KB entry');
        sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
      }
    },
  );

  return router;
}
