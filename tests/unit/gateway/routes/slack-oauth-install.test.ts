import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { slackOAuthRoutes } from '../../../../src/gateway/routes/slack-oauth.js';
import { signState } from '../../../../src/gateway/lib/oauth-state.js';

const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const OTHER_TENANT_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';
const TEAM_ID = 'T_SHARED_123';
const ENC_KEY = 'a'.repeat(64);
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
  process.env.ENCRYPTION_KEY = ENC_KEY;
  process.env.SLACK_CLIENT_ID = 'test-client-id';
  process.env.SLACK_CLIENT_SECRET = 'test-client-secret';
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
        tenantIntegration: {
          findFirst: vi.fn(),
          upsert: vi.fn(),
          ...((prismaOverrides.tenantIntegration as Record<string, unknown>) ?? {}),
        },
        $transaction: vi.fn(),
      } as never,
    }),
  );
  return app;
}

function makeIntegration(tenantId: string) {
  return {
    id: `int-${tenantId}`,
    tenant_id: tenantId,
    provider: 'slack',
    external_id: TEAM_ID,
    config: null,
    status: 'active',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  };
}

function mockSlackTokenExchange(
  team: { id: string; name: string } = { id: TEAM_ID, name: 'Shared Workspace' },
) {
  global.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ ok: true, access_token: 'xoxb-new-token', team }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function callbackUrl(tenantId: string): string {
  const state = signState(JSON.stringify({ tenant_id: tenantId, nonce: 'n'.repeat(32) }), ENC_KEY);
  return `/slack/oauth_callback?code=test-code&state=${encodeURIComponent(state)}`;
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

describe('GET /slack/oauth_callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('200 and upserts when a second tenant attaches a workspace already owned by another tenant', async () => {
    mockSlackTokenExchange();
    const secretUpsert = vi.fn().mockResolvedValue({ key: 'slack_bot_token', updated_at: NOW });
    const integrationUpsert = vi.fn().mockResolvedValue(makeIntegration(TENANT_ID));
    const app = makeApp({
      tenantSecret: { upsert: secretUpsert },
      tenantIntegration: {
        findFirst: vi.fn().mockResolvedValue(makeIntegration(OTHER_TENANT_ID)),
        upsert: integrationUpsert,
      },
    });

    const res = await request(app).get(callbackUrl(TENANT_ID)).redirects(0);

    expect(res.status).toBe(200);
    expect(res.text).toContain('Connected to Shared Workspace');
    expect(secretUpsert).toHaveBeenCalledTimes(1);
    expect(secretUpsert.mock.calls[0][0].where.tenant_id_key.tenant_id).toBe(TENANT_ID);
    expect(integrationUpsert).toHaveBeenCalledTimes(1);
    expect(integrationUpsert.mock.calls[0][0].where.tenant_id_provider.tenant_id).toBe(TENANT_ID);
  });

  it('200 and upserts (idempotent) when the same tenant re-connects the same workspace', async () => {
    mockSlackTokenExchange();
    const secretUpsert = vi.fn().mockResolvedValue({ key: 'slack_bot_token', updated_at: NOW });
    const integrationUpsert = vi.fn().mockResolvedValue(makeIntegration(TENANT_ID));
    const app = makeApp({
      tenantSecret: { upsert: secretUpsert },
      tenantIntegration: {
        findFirst: vi.fn().mockResolvedValue(makeIntegration(TENANT_ID)),
        upsert: integrationUpsert,
      },
    });

    const res = await request(app).get(callbackUrl(TENANT_ID)).redirects(0);

    expect(res.status).toBe(200);
    expect(integrationUpsert).toHaveBeenCalledTimes(1);
    expect(integrationUpsert.mock.calls[0][0].where.tenant_id_provider.tenant_id).toBe(TENANT_ID);
  });
});
