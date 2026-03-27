import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, disconnectPrisma } from '../setup.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
  await disconnectPrisma();
});

describe('/api/inngest endpoint', () => {
  it('GET /api/inngest responds (endpoint exists)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inngest',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);
  });

  it('PUT /api/inngest responds (registration endpoint)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/inngest',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);
  });
});
