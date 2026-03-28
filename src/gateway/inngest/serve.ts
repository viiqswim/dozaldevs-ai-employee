import type { FastifyInstance } from 'fastify';
import { serve } from 'inngest/fastify';
import { PrismaClient } from '@prisma/client';
import { createInngestClient } from './client.js';
import { createLifecycleFunction } from '../../inngest/lifecycle.js';
import { createRedispatchFunction } from '../../inngest/redispatch.js';

export async function inngestServeRoutes(app: FastifyInstance): Promise<void> {
  const inngest = createInngestClient();
  const prisma = new PrismaClient();

  const lifecycleFn = createLifecycleFunction(inngest, prisma);
  const redispatchFn = createRedispatchFunction(inngest, prisma);

  const handler = serve({
    client: inngest,
    functions: [lifecycleFn, redispatchFn],
  });

  app.route({
    method: ['GET', 'POST', 'PUT'],
    url: '/api/inngest',
    handler,
  });
}
