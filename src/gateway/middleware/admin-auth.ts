import crypto from 'node:crypto';
import type { preHandlerHookHandler } from 'fastify';

export const requireAdminKey: preHandlerHookHandler = async (request, reply) => {
  const provided = request.headers['x-admin-key'];
  const expectedKey = process.env.ADMIN_API_KEY ?? '';

  // Reject if header is missing, not a string, or empty
  if (typeof provided !== 'string' || provided.length === 0) {
    request.log.warn({ url: request.url }, 'Admin auth failed');
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expectedKey, 'utf8');

  // Length check FIRST — timingSafeEqual throws on unequal buffer lengths
  if (providedBuf.length !== expectedBuf.length) {
    request.log.warn({ url: request.url }, 'Admin auth failed');
    return reply.status(401).send({ error: 'Unauthorized' });
  }

  // Timing-safe comparison
  if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
    request.log.warn({ url: request.url }, 'Admin auth failed');
    return reply.status(401).send({ error: 'Unauthorized' });
  }
};
