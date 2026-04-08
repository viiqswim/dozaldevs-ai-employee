import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { requireAdminKey } from '../middleware/admin-auth.js';
import { createProject } from '../services/project-registry.js';
import { CreateProjectSchema } from '../validation/schemas.js';
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
};
