import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import { TestApp } from '../../setup.js';
import { authMiddleware } from '../../../src/gateway/middleware/auth.js';

let app: TestApp;

beforeEach(async () => {
  process.env.SERVICE_TOKEN = 'test-service-token-x';
  process.env.SUPABASE_URL = 'http://localhost:54331';
  process.env.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dGVzdA.test';
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.get('/admin/ping', authMiddleware, (_req, res) => {
    res.json({ success: true });
  });
  app = new TestApp(expressApp);
  await app.ready();
});

afterEach(async () => {
  delete process.env.SERVICE_TOKEN;
  await app.close();
});

describe('authMiddleware — SERVICE_TOKEN Bearer', () => {
  it('missing Authorization header → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ping',
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error).toBe('AUTHENTICATION_REQUIRED');
  });

  it('wrong token value → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ping',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    });

    expect(res.statusCode).toBe(401);
  });

  it('correct SERVICE_TOKEN → 200 with success response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ping',
      headers: {
        authorization: 'Bearer test-service-token-x',
      },
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.success).toBe(true);
  });

  it('empty Authorization header → 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/ping',
      headers: {
        authorization: '',
      },
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body);
    expect(json.error).toBe('AUTHENTICATION_REQUIRED');
  });
});
