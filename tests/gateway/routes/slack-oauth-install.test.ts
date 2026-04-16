import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { slackOAuthRoutes } from '../../../src/gateway/routes/slack-oauth.js';

const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const NOW = new Date('2026-01-01T00:00:00Z');

function makeTenant() {
  return {
    id: TENANT_ID,
    name: 'Acme',
    slug: 'acme',
    slack_team_id: null,
    config: null,
    status: 'active',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.SLACK_CLIENT_ID = 'test-client-id';
  process.env.SLACK_REDIRECT_BASE_URL = 'http://localhost:3000';
  const app = express();
  app.use(express.json());
  app.use(
    slackOAuthRoutes({
      prisma: {
        tenant: {
          findFirst: vi.fn(),
          update: vi.fn(),
          ...((prismaOverrides.tenant as Record<string, unknown>) ?? {}),
        },
        tenantSecret: {
          upsert: vi.fn(),
          ...((prismaOverrides.tenantSecret as Record<string, unknown>) ?? {}),
        },
        $transaction: vi.fn(),
      } as never,
    }),
  );
  return app;
}

describe('GET /slack/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('400 when tenant query param is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/slack/install');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_TENANT_ID');
  });

  it('400 when tenant is not a UUID', async () => {
    const app = makeApp();
    const res = await request(app).get('/slack/install?tenant=not-a-uuid');
    expect(res.status).toBe(400);
  });

  it('404 when tenant not found', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(null) } });
    const res = await request(app).get(`/slack/install?tenant=${TENANT_ID}`);
    expect(res.status).toBe(404);
  });

  it('302 redirect with signed state when tenant exists', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) } });
    const res = await request(app).get(`/slack/install?tenant=${TENANT_ID}`).redirects(0);
    expect(res.status).toBe(302);
    const location = res.headers['location'] as string;
    expect(location).toContain('slack.com/oauth/v2/authorize');
    expect(location).toContain('client_id=test-client-id');
    expect(location).toContain('state=');
    const stateMatch = location.match(/state=([^&]+)/);
    expect(stateMatch).toBeTruthy();
    const state = decodeURIComponent(stateMatch![1]);
    expect(state).toContain('.');
  });

  it('state contains tenant_id encoded in base64', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) } });
    const res = await request(app).get(`/slack/install?tenant=${TENANT_ID}`).redirects(0);
    const location = res.headers['location'] as string;
    const stateMatch = location.match(/state=([^&]+)/);
    const state = decodeURIComponent(stateMatch![1]);
    const b64 = state.split('.')[0];
    const decoded = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as {
      tenant_id: string;
      nonce: string;
    };
    expect(decoded.tenant_id).toBe(TENANT_ID);
    expect(decoded.nonce).toHaveLength(32);
  });
});
