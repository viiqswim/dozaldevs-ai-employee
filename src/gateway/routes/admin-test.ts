import type { FastifyInstance } from 'fastify';
import { requireAdminKey } from '../middleware/admin-auth.js';

export async function adminTestRoutes(app: FastifyInstance): Promise<void> {
  app.get('/admin/test', { preHandler: requireAdminKey }, async (_request, reply) => {
    return reply.send({ success: true });
  });
}
