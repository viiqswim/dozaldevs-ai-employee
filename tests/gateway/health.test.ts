import { describe, it, expect, afterAll, beforeAll } from 'vitest';
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

describe('/health endpoint', () => {
  it('returns 200 with { status: "ok" }', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('does not require authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
    });
    // No auth headers needed, still 200
    expect(res.statusCode).toBe(200);
  });

  it('returns 404 for unknown route', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/nonexistent',
    });
    expect(res.statusCode).toBe(404);
  });

  it('buildApp() creates isolated instances', async () => {
    const { buildApp } = await import('../../src/gateway/server.js');
    const app2 = await buildApp();
    await app2.ready();
    // Different instances
    expect(app).not.toBe(app2);
    await app2.close();
  });
});
