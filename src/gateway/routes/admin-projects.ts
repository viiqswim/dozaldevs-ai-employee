import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdminKey } from '../middleware/admin-auth.js';
import {
  createProject,
  listProjects,
  getProjectById,
  updateProject,
  deleteProject,
  type DeleteProjectResult,
} from '../services/project-registry.js';
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  TenantIdParamSchema,
  TenantProjectParamSchema,
} from '../validation/schemas.js';
import { ProjectRegistryConflictError } from '../../lib/errors.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

export interface AdminProjectRouteOptions {
  prisma?: PrismaClient;
}

export function adminProjectRoutes(opts: AdminProjectRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  router.post('/admin/tenants/:tenantId/projects', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    const result = CreateProjectSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: result.error.issues });
      return;
    }

    try {
      const project = await createProject({
        input: result.data,
        tenantId: paramResult.data.tenantId,
        prisma,
      });
      res.status(201).json(project);
    } catch (err) {
      if (err instanceof ProjectRegistryConflictError) {
        res.status(409).json({ error: 'CONFLICT', message: (err as Error).message });
        return;
      }
      logger.error({ err }, 'Failed to create project');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/admin/tenants/:tenantId/projects', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    try {
      const projects = await listProjects({
        tenantId: paramResult.data.tenantId,
        prisma,
      });
      res.status(200).json({ projects });
    } catch (err) {
      logger.error({ err }, 'Failed to list projects');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.get('/admin/tenants/:tenantId/projects/:id', requireAdminKey, async (req, res) => {
    const paramResult = TenantProjectParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    try {
      const project = await getProjectById({
        id: paramResult.data.id,
        tenantId: paramResult.data.tenantId,
        prisma,
      });

      if (!project) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      res.status(200).json(project);
    } catch (err) {
      logger.error({ err }, 'Failed to get project');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.patch('/admin/tenants/:tenantId/projects/:id', requireAdminKey, async (req, res) => {
    const paramResult = TenantProjectParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    const result = UpdateProjectSchema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({ error: 'INVALID_REQUEST', issues: result.error.issues });
      return;
    }

    try {
      const project = await updateProject({
        id: paramResult.data.id,
        input: result.data,
        tenantId: paramResult.data.tenantId,
        prisma,
      });

      if (!project) {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      res.status(200).json(project);
    } catch (err) {
      if (err instanceof ProjectRegistryConflictError) {
        res.status(409).json({ error: 'CONFLICT', message: (err as Error).message });
        return;
      }
      logger.error({ err }, 'Failed to update project');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  router.delete('/admin/tenants/:tenantId/projects/:id', requireAdminKey, async (req, res) => {
    const paramResult = TenantProjectParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      res.status(400).json({ error: 'INVALID_ID' });
      return;
    }

    try {
      const result: DeleteProjectResult = await deleteProject({
        id: paramResult.data.id,
        tenantId: paramResult.data.tenantId,
        prisma,
      });

      if (result.deleted) {
        res.status(204).send();
        return;
      }

      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'NOT_FOUND' });
        return;
      }

      res.status(409).json({
        error: 'CONFLICT',
        message: 'Project has active tasks. Wait for them to complete or cancel them first.',
        activeTaskIds: result.activeTaskIds,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to delete project');
      res.status(500).json({ error: 'INTERNAL_ERROR' });
    }
  });

  return router;
}
