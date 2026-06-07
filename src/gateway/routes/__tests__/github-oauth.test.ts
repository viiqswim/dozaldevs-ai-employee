import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

const { mockFindBySlug, mockSecretSet, mockIntegrationUpsert } = vi.hoisted(() => ({
  mockFindBySlug: vi.fn(),
  mockSecretSet: vi.fn(),
  mockIntegrationUpsert: vi.fn(),
}));

vi.mock('../../services/tenant-repository.js', () => ({
  TenantRepository: vi.fn(() => ({
    findBySlug: mockFindBySlug,
  })),
}));

vi.mock('../../services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({
    set: mockSecretSet,
  })),
}));

vi.mock('../../services/tenant-integration-repository.js', () => ({
  TenantIntegrationRepository: vi.fn(() => ({
    upsert: mockIntegrationUpsert,
  })),
}));

import { signState } from '../../lib/oauth-state.js';
import { githubOAuthRoutes } from '../github-oauth.js';

const TEST_KEY = 'a'.repeat(64);
const TENANT_SLUG = 'vlre';
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/integrations', githubOAuthRoutes({ prisma: {} as never }));
  return app;
}

function buildValidState(tenantId: string): string {
  const payload = JSON.stringify({
    tenant_id: tenantId,
    nonce: crypto.randomBytes(16).toString('hex'),
  });
  return signState(payload, TEST_KEY);
}

describe('GET /integrations/github/install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = TEST_KEY;
    process.env.GITHUB_APP_NAME = 'my-test-app';
  });

  it('returns 302 with GitHub installation URL when tenant is valid', async () => {
    mockFindBySlug.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
    const app = makeApp();
    const res = await request(app).get(`/integrations/github/install?tenant=${TENANT_SLUG}`);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(
      /^https:\/\/github\.com\/apps\/my-test-app\/installations\/new/,
    );
    expect(res.headers['location']).toContain('state=');
  });

  it('returns 400 when tenant query param is missing', async () => {
    const app = makeApp();
    const res = await request(app).get('/integrations/github/install');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'MISSING_TENANT' });
  });

  it('returns 400 when tenant slug is not found', async () => {
    mockFindBySlug.mockResolvedValue(null);
    const app = makeApp();
    const res = await request(app).get('/integrations/github/install?tenant=nonexistent');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'TENANT_NOT_FOUND' });
  });

  it('returns 503 when GITHUB_APP_NAME is not configured', async () => {
    mockFindBySlug.mockResolvedValue({ id: TENANT_ID, slug: TENANT_SLUG });
    const app = makeApp();
    delete process.env.GITHUB_APP_NAME;
    const res = await request(app).get(`/integrations/github/install?tenant=${TENANT_SLUG}`);
    expect(res.status).toBe(503);
  });
});

describe('GET /integrations/github/callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENCRYPTION_KEY = TEST_KEY;
    process.env.GITHUB_APP_NAME = 'my-test-app';
  });

  it('stores installation_id as secret and redirects to /dashboard/integrations', async () => {
    mockSecretSet.mockResolvedValue({
      key: 'github_installation_id',
      is_set: true,
      updated_at: new Date(),
    });
    mockIntegrationUpsert.mockResolvedValue({});
    const state = buildValidState(TENANT_ID);
    const app = makeApp();
    const res = await request(app).get(
      `/integrations/github/callback?installation_id=12345678&setup_action=install&state=${encodeURIComponent(state)}`,
    );
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe(
      `/dashboard/integrations?tenant=${TENANT_ID}&connected=github`,
    );
    expect(mockSecretSet).toHaveBeenCalledWith(TENANT_ID, 'github_installation_id', '12345678');
    expect(mockIntegrationUpsert).toHaveBeenCalledWith(TENANT_ID, 'github', {
      external_id: '12345678',
    });
  });

  it('returns 400 when installation_id is missing', async () => {
    const state = buildValidState(TENANT_ID);
    const app = makeApp();
    const res = await request(app).get(
      `/integrations/github/callback?setup_action=install&state=${encodeURIComponent(state)}`,
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'MISSING_PARAMS' });
  });

  it('returns 400 when state param is missing', async () => {
    const app = makeApp();
    const res = await request(app).get(
      '/integrations/github/callback?installation_id=12345678&setup_action=install',
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'MISSING_PARAMS' });
  });

  it('returns 400 when state HMAC is invalid', async () => {
    const app = makeApp();
    const res = await request(app).get(
      '/integrations/github/callback?installation_id=12345678&state=tampered.0000bad',
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'INVALID_STATE' });
  });

  it('does not call secretRepo or integrationRepo when state is invalid', async () => {
    const app = makeApp();
    await request(app).get(
      '/integrations/github/callback?installation_id=12345678&state=bad.state',
    );
    expect(mockSecretSet).not.toHaveBeenCalled();
    expect(mockIntegrationUpsert).not.toHaveBeenCalled();
  });
});
