import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdminKey } from '../middleware/admin-auth.js';
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
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface AdminKbRouteOptions {
  prisma?: PrismaClient;
}

export function adminKbRoutes(opts: AdminKbRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  // POST /admin/tenants/:tenantId/kb/entries — Create KB entry
  router.post('/admin/tenants/:tenantId/kb/entries', requireAdminKey, async (req, res) => {
    const paramResult = KbEntryTenantParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    const result = CreateKbEntrySchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: result.error.issues });
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
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof KbEntryConflictError) {
        res.status(409).json({ error: 'CONFLICT', message: (err as Error).message });
        return;
      }
      logger.error({ err }, 'Failed to create KB entry');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  // GET /admin/tenants/:tenantId/kb/entries — List KB entries (with optional filters)
  router.get('/admin/tenants/:tenantId/kb/entries', requireAdminKey, async (req, res) => {
    const paramResult = KbEntryTenantParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    const queryResult = ListKbEntriesQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: queryResult.error.issues });
      return;
    }

    try {
      const entries = await listKbEntries({
        tenantId: paramResult.data.tenantId,
        entityType: queryResult.data.entity_type,
        entityId: queryResult.data.entity_id,
        prisma,
      });
      res.status(200).json({ entries });
    } catch (err) {
      logger.error({ err }, 'Failed to list KB entries');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  // GET /admin/tenants/:tenantId/kb/entries/:entryId — Get single KB entry
  router.get('/admin/tenants/:tenantId/kb/entries/:entryId', requireAdminKey, async (req, res) => {
    const paramResult = KbEntryIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    try {
      const entry = await getKbEntry({
        tenantId: paramResult.data.tenantId,
        entryId: paramResult.data.entryId,
        prisma,
      });

      if (!entry) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      res.status(200).json(entry);
    } catch (err) {
      logger.error({ err }, 'Failed to get KB entry');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  // PATCH /admin/tenants/:tenantId/kb/entries/:entryId — Update KB entry content
  router.patch(
    '/admin/tenants/:tenantId/kb/entries/:entryId',
    requireAdminKey,
    async (req, res) => {
      const paramResult = KbEntryIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'INVALID_ID' });
        return;
      }

      const result = UpdateKbEntrySchema.safeParse(req.body);
      if (!result.success) {
        res.status(400).json({ error: 'INVALID_REQUEST', issues: result.error.issues });
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
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }

        res.status(200).json(entry);
      } catch (err) {
        logger.error({ err }, 'Failed to update KB entry');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  // DELETE /admin/tenants/:tenantId/kb/entries/:entryId — Delete KB entry
  router.delete(
    '/admin/tenants/:tenantId/kb/entries/:entryId',
    requireAdminKey,
    async (req, res) => {
      const paramResult = KbEntryIdParamSchema.safeParse(req.params);
      if (!paramResult.success) {
        res.status(400).json({ error: 'INVALID_ID' });
        return;
      }

      try {
        const { count } = await deleteKbEntry({
          tenantId: paramResult.data.tenantId,
          entryId: paramResult.data.entryId,
          prisma,
        });

        if (count === 0) {
          res.status(404).json({ error: 'NOT_FOUND' });
          return;
        }

        res.status(204).send();
      } catch (err) {
        logger.error({ err }, 'Failed to delete KB entry');
        res.status(500).json({ error: 'INTERNAL_ERROR' });
      }
    },
  );

  return router;
}
