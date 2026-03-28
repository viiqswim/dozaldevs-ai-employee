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

  it('PUT /api/inngest route exists (registration endpoint)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/inngest',
    });
    expect(res.statusCode).not.toBe(404);
  });

  it('GET /api/inngest response includes function_count metadata', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inngest',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);
    const body = JSON.parse(res.body);
    expect(body.function_count).toBeDefined();
    expect(body.function_count).toBeGreaterThanOrEqual(2);
  });

  it('GET /api/inngest response includes mode and schema_version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inngest',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);
    const body = JSON.parse(res.body);
    expect(body.mode).toBe('dev');
    expect(body.schema_version).toBeDefined();
  });

  it('GET /api/inngest response includes signing and event key flags', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inngest',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);
    const body = JSON.parse(res.body);
    expect(body.has_signing_key).toBeDefined();
    expect(body.has_event_key).toBeDefined();
  });

  it('GET /api/inngest response indicates 2 functions are registered', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/inngest',
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(200);
    expect(res.statusCode).toBeLessThan(300);
    const body = JSON.parse(res.body);
    expect(body.function_count).toBe(2);
  });
});
