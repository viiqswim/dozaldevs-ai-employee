import type { FastifyInstance } from 'fastify';

/**
 * GitHub webhook handler — stub only.
 * Full implementation in M4 when the review agent is built.
 */
export async function githubRoutes(app: FastifyInstance): Promise<void> {
  app.post('/webhooks/github', async (request, reply) => {
    request.log.info({ event: 'github_webhook_received_stub' }, 'GitHub webhook received (stub)');
    return reply.send({
      received: true,
      stub: true,
      message: 'GitHub webhook processing is not active in MVP. Active in M4.',
    });
  });
}
