import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
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
import { CreateProjectSchema, UpdateProjectSchema } from '../validation/schemas.js';
import { ProjectRegistryConflictError } from '../../lib/errors.js';

const SYSTEM_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export interface AdminProjectRouteOptions extends FastifyPluginOptions {
  prisma?: PrismaClient;
}

export const adminProjectRoutes: FastifyPluginAsync<AdminProjectRouteOptions> = async (
  fastify,
  opts,
) => {
  const prisma = opts.prisma ?? new PrismaClient();

  fastify.addHook('preHandler', requireAdminKey);

  fastify.post('/admin/projects', async (req, reply) => {
    const result = CreateProjectSchema.safeParse(req.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'INVALID_REQUEST', issues: result.error.issues });
    }

    try {
      const project = await createProject({
        input: {
          ...result.data,
          tooling_config: result.data.tooling_config as Record<string, string> | undefined,
        },
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      });
      return reply.code(201).send(project);
    } catch (err) {
      if (err instanceof ProjectRegistryConflictError) {
        return reply.code(409).send({ error: 'CONFLICT', message: err.message });
      }
      req.log.error({ err }, 'Failed to create project');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });

  fastify.get('/admin/projects', async (req, reply) => {
    try {
      const projects = await listProjects({
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      });
      return reply.code(200).send({ projects });
    } catch (err) {
      req.log.error({ err }, 'Failed to list projects');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });

  fastify.get<{ Params: { id: string } }>('/admin/projects/:id', async (req, reply) => {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return reply.code(400).send({ error: 'INVALID_ID' });
    }

    try {
      const project = await getProjectById({
        id,
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      });

      if (!project) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }

      return reply.code(200).send(project);
    } catch (err) {
      req.log.error({ err }, 'Failed to get project');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });

  fastify.patch<{ Params: { id: string } }>('/admin/projects/:id', async (req, reply) => {
    const { id } = req.params;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return reply.code(400).send({ error: 'INVALID_ID' });
    }

    const result = UpdateProjectSchema.safeParse(req.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'INVALID_REQUEST', issues: result.error.issues });
    }

    try {
      const project = await updateProject({
        id,
        input: result.data,
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      });

      if (!project) {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }

      return reply.code(200).send(project);
    } catch (err) {
      if (err instanceof ProjectRegistryConflictError) {
        return reply.code(409).send({ error: 'CONFLICT', message: err.message });
      }
      req.log.error({ err }, 'Failed to update project');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/admin/projects/:id', async (req, reply) => {
    const { id } = req.params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return reply.code(400).send({ error: 'INVALID_ID' });
    }

    try {
      const result: DeleteProjectResult = await deleteProject({
        id,
        tenantId: SYSTEM_TENANT_ID,
        prisma,
      });

      if (result.deleted) {
        return reply.code(204).send();
      }

      if (result.reason === 'not_found') {
        return reply.code(404).send({ error: 'NOT_FOUND' });
      }

      return reply.code(409).send({
        error: 'CONFLICT',
        message: 'Project has active tasks. Wait for them to complete or cancel them first.',
        activeTaskIds: result.activeTaskIds,
      });
    } catch (err) {
      req.log.error({ err }, 'Failed to delete project');
      return reply.code(500).send({ error: 'INTERNAL_ERROR' });
    }
  });
};
