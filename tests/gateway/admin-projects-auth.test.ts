import { describe, it, expect, afterEach, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, disconnectPrisma } from '../setup.js';

let app: FastifyInstance;

beforeEach(async () => {
  // Set the admin key BEFORE creating the test app
  process.env.ADMIN_API_KEY = 'test-admin-key-x';
  app = await createTestApp();
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('requireAdminKey middleware', () => {
  it('missing X-Admin-Key header → 401 with error body', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/test',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error).toBe('Unauthorized');
  });

  it('wrong key value → 401 with error body', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/test',
      headers: {
        'x-admin-key': 'wrong-key',
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error).toBe('Unauthorized');
  });

  it('key with wrong length (one char) → 401, no ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH thrown', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/test',
      headers: {
        'x-admin-key': 'x',
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error).toBe('Unauthorized');
  });

  it('correct key → 200 with success response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/test',
      headers: {
        'x-admin-key': 'test-admin-key-x',
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
  });

  it('array value header (multiple values) → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/test',
      headers: {
        'x-admin-key': ['test-admin-key-x', 'another-key'],
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error).toBe('Unauthorized');
  });

  it('empty string header → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/test',
      headers: {
        'x-admin-key': '',
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error).toBe('Unauthorized');
  });
});
