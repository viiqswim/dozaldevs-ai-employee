import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, getPrisma, cleanupTestData, disconnectPrisma } from '../setup.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterEach(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await app.close();
  await disconnectPrisma();
});

describe('POST /webhooks/github (stub)', () => {
  it('returns 200 with stub=true and received=true', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      payload: { action: 'opened', repository: { full_name: 'org/repo' } },
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.stub).toBe(true);
    expect(json.received).toBe(true);
  });

  it('no tasks are created after stub request', async () => {
    await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      payload: { action: 'opened' },
    });
    const count = await getPrisma().task.count();
    expect(count).toBe(0);
  });

  it('accepts any payload without error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
  });

  it('responds to empty body without error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/github',
    });
    expect(res.statusCode).toBe(200);
  });
});
