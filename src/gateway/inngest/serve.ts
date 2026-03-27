import type { FastifyInstance } from 'fastify';
import { serve } from 'inngest/fastify';
import type { InngestLike } from '../server.js';

export interface InngestServeOptions {
  inngestClient?: InngestLike;
}

/**
 * Register the /api/inngest endpoint for Inngest function discovery and invocation.
 * Phase 3 will add actual function handlers; this phase registers the endpoint with zero functions.
 */
export async function inngestServeRoutes(
  app: FastifyInstance,
  opts: InngestServeOptions,
): Promise<void> {
  if (!opts.inngestClient) {
    throw new Error('inngestClient is required for inngestServeRoutes');
  }

  const handler = serve({
    client: opts.inngestClient as any,
    functions: [],
  });

  app.route({
    method: ['GET', 'POST', 'PUT'],
    url: '/api/inngest',
    handler,
  });
}
