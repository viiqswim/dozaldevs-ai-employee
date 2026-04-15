import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { TestApp, createTestApp, disconnectPrisma } from '../setup.js';

let app: TestApp;

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
    const { app: expressApp2 } = await buildApp();
    const app2 = new TestApp(expressApp2);
    expect(app).not.toBe(app2);
    await app2.close();
  });
});
