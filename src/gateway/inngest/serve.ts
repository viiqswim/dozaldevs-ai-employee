import type { FastifyInstance } from 'fastify';
import { serve } from 'inngest/fastify';
import { createInngestClient } from './client.js';

export async function inngestServeRoutes(app: FastifyInstance): Promise<void> {
  const inngest = createInngestClient();

  const handler = serve({
    client: inngest,
    functions: [],
  });

  app.route({
    method: ['GET', 'POST', 'PUT'],
    url: '/api/inngest',
    handler,
  });
}
