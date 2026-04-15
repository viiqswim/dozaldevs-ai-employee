import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { TestApp } from '../setup.js';
import { requireAdminKey } from '../../src/gateway/middleware/admin-auth.js';

let app: TestApp;

beforeEach(async () => {
  process.env.ADMIN_API_KEY = 'test-admin-key-x';
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.get('/admin/ping', requireAdminKey, (_req, res) => {
    res.json({ success: true });
  });
  app = new TestApp(expressApp);
  await app.ready();
});

afterEach(async () => {
  delete process.env.ADMIN_API_KEY;
  await app.close();
});

describe('requireAdminKey middleware', () => {
  it('missing X-Admin-Key header → 401 with error body', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ping',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error).toBe('Unauthorized');
  });

  it('wrong key value → 401 with error body', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ping',
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
      url: '/admin/ping',
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
      url: '/admin/ping',
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
      url: '/admin/ping',
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
      url: '/admin/ping',
      headers: {
        'x-admin-key': '',
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error).toBe('Unauthorized');
  });
});
