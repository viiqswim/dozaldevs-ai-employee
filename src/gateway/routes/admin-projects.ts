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
import { sendError } from '../lib/http-response.js';
import { ERROR_CODES } from '../lib/prisma-helpers.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('admin-projects');

export interface AdminProjectRouteOptions {
  prisma?: PrismaClient;
}

export function adminProjectRoutes(opts: AdminProjectRouteOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  router.post('/admin/tenants/:tenantId/projects', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_ID);
      return;
    }

    const result = CreateProjectSchema.safeParse(req.body);
    if (!result.success) {
      sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, { issues: result.error.issues });
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
        sendError(res, 409, 'CONFLICT', (err as Error).message);
        return;
      }
      logger.error({ err }, 'Failed to create project');
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
    }
  });

  router.get('/admin/tenants/:tenantId/projects', requireAdminKey, async (req, res) => {
    const paramResult = TenantIdParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_ID);
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
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
    }
  });

  router.get('/admin/tenants/:tenantId/projects/:id', requireAdminKey, async (req, res) => {
    const paramResult = TenantProjectParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_ID);
      return;
    }

    try {
      const project = await getProjectById({
        id: paramResult.data.id,
        tenantId: paramResult.data.tenantId,
        prisma,
      });

      if (!project) {
        sendError(res, 404, ERROR_CODES.NOT_FOUND);
        return;
      }

      res.status(200).json(project);
    } catch (err) {
      logger.error({ err }, 'Failed to get project');
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
    }
  });

  router.patch('/admin/tenants/:tenantId/projects/:id', requireAdminKey, async (req, res) => {
    const paramResult = TenantProjectParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_ID);
      return;
    }

    const result = UpdateProjectSchema.safeParse(req.body);
    if (!result.success) {
      sendError(res, 400, ERROR_CODES.INVALID_REQUEST, undefined, { issues: result.error.issues });
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
        sendError(res, 404, ERROR_CODES.NOT_FOUND);
        return;
      }

      res.status(200).json(project);
    } catch (err) {
      if (err instanceof ProjectRegistryConflictError) {
        sendError(res, 409, 'CONFLICT', (err as Error).message);
        return;
      }
      logger.error({ err }, 'Failed to update project');
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
    }
  });

  router.delete('/admin/tenants/:tenantId/projects/:id', requireAdminKey, async (req, res) => {
    const paramResult = TenantProjectParamSchema.safeParse(req.params);
    if (!paramResult.success) {
      sendError(res, 400, ERROR_CODES.INVALID_ID);
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
        sendError(res, 404, ERROR_CODES.NOT_FOUND);
        return;
      }

      sendError(
        res,
        409,
        'CONFLICT',
        'Project has active tasks. Wait for them to complete or cancel them first.',
        { activeTaskIds: result.activeTaskIds },
      );
    } catch (err) {
      logger.error({ err }, 'Failed to delete project');
      sendError(res, 500, ERROR_CODES.INTERNAL_ERROR);
    }
  });

  return router;
}
