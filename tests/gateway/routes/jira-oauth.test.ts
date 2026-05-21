import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { jiraOAuthRoutes } from '../../../src/gateway/routes/jira-oauth.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const NOW = new Date('2026-01-01T00:00:00Z');

function makeTenant() {
  return {
    id: TENANT_ID,
    name: 'VLRE',
    slug: 'vlre',
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
  delete process.env.JIRA_CLIENT_ID;

  const app = express();
  app.use(express.json());
  app.use(
    '/integrations',
    jiraOAuthRoutes({
      prisma: {
        tenant: {
          findFirst: vi.fn().mockResolvedValue(null),
          ...((prismaOverrides.tenant as Record<string, unknown>) ?? {}),
        },
        tenantSecret: {
          upsert: vi.fn().mockResolvedValue({}),
          ...((prismaOverrides.tenantSecret as Record<string, unknown>) ?? {}),
        },
        tenantIntegration: {
          upsert: vi.fn().mockResolvedValue({}),
          ...((prismaOverrides.tenantIntegration as Record<string, unknown>) ?? {}),
        },
      } as never,
    }),
  );
  return app;
}

describe('GET /integrations/jira/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.JIRA_CLIENT_ID;
  });

  it('400 when tenant query param is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/integrations/jira/install');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_TENANT');
  });

  it('400 when tenant slug is not found in the database', async () => {
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const res = await request(app).get('/integrations/jira/install?tenant=unknown-slug');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TENANT_NOT_FOUND');
  });

  it('503 when JIRA_CLIENT_ID env var is not set', async () => {
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) },
    });
    const res = await request(app).get('/integrations/jira/install?tenant=vlre');
    expect(res.status).toBe(503);
    expect(res.body.error).toContain('JIRA_CLIENT_ID');
  });

  it('302 redirect to Atlassian auth URL when tenant exists and JIRA_CLIENT_ID is set', async () => {
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) },
    });
    process.env.JIRA_CLIENT_ID = 'test-jira-client-id';
    const res = await request(app).get('/integrations/jira/install?tenant=vlre').redirects(0);
    expect(res.status).toBe(302);
    const location = res.headers['location'] as string;
    expect(location).toContain('auth.atlassian.com');
    expect(location).toContain('client_id=test-jira-client-id');
    expect(location).toContain('state=');
  });

  it('redirect URL includes required OAuth params (audience, scope, response_type)', async () => {
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) },
    });
    process.env.JIRA_CLIENT_ID = 'test-jira-client-id';
    const res = await request(app).get('/integrations/jira/install?tenant=vlre').redirects(0);
    const location = res.headers['location'] as string;
    expect(location).toContain('audience=');
    expect(location).toContain('scope=');
    expect(location).toContain('response_type=code');
  });

  it('state token is a signed payload containing the tenant_id', async () => {
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) },
    });
    process.env.JIRA_CLIENT_ID = 'test-jira-client-id';
    const res = await request(app).get('/integrations/jira/install?tenant=vlre').redirects(0);
    const location = res.headers['location'] as string;
    const stateMatch = location.match(/state=([^&]+)/);
    expect(stateMatch).toBeTruthy();
    const state = decodeURIComponent(stateMatch![1]);
    const dot = state.lastIndexOf('.');
    expect(dot).toBeGreaterThan(0);
    const b64 = state.slice(0, dot);
    const decoded = JSON.parse(Buffer.from(b64, 'base64url').toString('utf8')) as {
      tenant_id: string;
      nonce: string;
    };
    expect(decoded.tenant_id).toBe(TENANT_ID);
    expect(decoded.nonce).toHaveLength(32);
  });
});
