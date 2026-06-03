import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';

const { mockFindByExternalId, mockFindManyByExternalId, mockIntegrationDelete, mockSecretDelete } =
  vi.hoisted(() => ({
    mockFindByExternalId: vi.fn(),
    mockFindManyByExternalId: vi.fn(),
    mockIntegrationDelete: vi.fn(),
    mockSecretDelete: vi.fn(),
  }));

vi.mock('../../services/tenant-integration-repository.js', () => ({
  TenantIntegrationRepository: vi.fn(() => ({
    findByExternalId: mockFindByExternalId,
    findManyByExternalId: mockFindManyByExternalId,
    delete: mockIntegrationDelete,
  })),
}));

vi.mock('../../services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({
    delete: mockSecretDelete,
  })),
}));

import { githubRoutes } from '../github.js';

const WEBHOOK_SECRET = 'test-github-webhook-secret';
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const INSTALLATION_ID = '137559864';

function sign(body: string, secret: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function makeApp() {
  const app = express();
  app.use(
    express.json({
      verify: (req: express.Request & { rawBody?: string }, _res, buf) => {
        req.rawBody = buf.toString('utf8');
      },
    }),
  );
  app.use(githubRoutes({ prisma: {} as never }));
  return app;
}

function makeInstallationPayload(action: string, installationId = INSTALLATION_ID) {
  return {
    action,
    installation: {
      id: parseInt(installationId, 10),
      account: { login: 'viiqswim', id: 987654 },
      app_id: 3944354,
    },
    sender: { login: 'viiqswim' },
  };
}

describe('POST /webhooks/github', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
  });

  afterEach(() => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
  });

  it('installation.deleted — soft-deletes integration and secret for known installation', async () => {
    mockFindManyByExternalId.mockResolvedValue([
      {
        id: 'int-1',
        tenant_id: TENANT_ID,
        provider: 'github',
        external_id: INSTALLATION_ID,
      },
    ]);
    mockIntegrationDelete.mockResolvedValue(undefined);
    mockSecretDelete.mockResolvedValue(true);

    const payload = makeInstallationPayload('deleted');
    const body = JSON.stringify(payload);
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', sign(body, WEBHOOK_SECRET))
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, action: 'deleted', tenants_cleaned: 1 });
    expect(mockFindManyByExternalId).toHaveBeenCalledWith('github', INSTALLATION_ID);
    expect(mockIntegrationDelete).toHaveBeenCalledWith(TENANT_ID, 'github');
    expect(mockSecretDelete).toHaveBeenCalledWith(TENANT_ID, 'github_installation_id');
  });

  it('installation.created — returns 200 no-op (tenant association via callback)', async () => {
    const payload = makeInstallationPayload('created');
    const body = JSON.stringify(payload);
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', sign(body, WEBHOOK_SECRET))
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, action: 'ignored_handled_by_callback' });
    expect(mockFindByExternalId).not.toHaveBeenCalled();
    expect(mockIntegrationDelete).not.toHaveBeenCalled();
    expect(mockSecretDelete).not.toHaveBeenCalled();
  });

  it('returns 401 when X-Hub-Signature-256 header is missing', async () => {
    const body = JSON.stringify(makeInstallationPayload('deleted'));
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid webhook signature' });
    expect(mockFindByExternalId).not.toHaveBeenCalled();
  });

  it('returns 401 when signature is invalid', async () => {
    const body = JSON.stringify(makeInstallationPayload('deleted'));
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set(
        'x-hub-signature-256',
        'sha256=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb',
      )
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid webhook signature' });
    expect(mockFindByExternalId).not.toHaveBeenCalled();
  });

  it('non-installation event returns 200 no-op', async () => {
    const body = JSON.stringify({ action: 'created', pull_request: { number: 1 } });
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'pull_request')
      .set('x-hub-signature-256', sign(body, WEBHOOK_SECRET))
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, action: 'ignored' });
    expect(mockFindByExternalId).not.toHaveBeenCalled();
  });

  it('installation.deleted with unknown installation_id returns 200 no-op', async () => {
    mockFindManyByExternalId.mockResolvedValue([]);

    const payload = makeInstallationPayload('deleted', '999999999');
    const body = JSON.stringify(payload);
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', sign(body, WEBHOOK_SECRET))
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, action: 'unknown_installation' });
    expect(mockIntegrationDelete).not.toHaveBeenCalled();
    expect(mockSecretDelete).not.toHaveBeenCalled();
  });

  it('returns 401 when GITHUB_WEBHOOK_SECRET env is not set', async () => {
    delete process.env.GITHUB_WEBHOOK_SECRET;
    const body = JSON.stringify(makeInstallationPayload('deleted'));
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', sign(body, WEBHOOK_SECRET))
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Webhook signing not configured' });
  });

  it('verifies rawBody is used for signature (not re-serialized JSON)', async () => {
    const payload = makeInstallationPayload('created');
    const body = JSON.stringify(payload);
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', sign(body, WEBHOOK_SECRET))
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
  });

  it('installation with unhandled action returns 200 no-op', async () => {
    const payload = makeInstallationPayload('suspend');
    const body = JSON.stringify(payload);
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', sign(body, WEBHOOK_SECRET))
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, action: 'ignored' });
  });

  it('installation.deleted — cleans up ALL tenants sharing the installation', async () => {
    const TENANT_ID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';
    mockFindManyByExternalId.mockResolvedValue([
      { id: 'int-1', tenant_id: TENANT_ID, provider: 'github', external_id: INSTALLATION_ID },
      { id: 'int-2', tenant_id: TENANT_ID_2, provider: 'github', external_id: INSTALLATION_ID },
    ]);
    mockIntegrationDelete.mockResolvedValue(undefined);
    mockSecretDelete.mockResolvedValue(true);

    const payload = makeInstallationPayload('deleted');
    const body = JSON.stringify(payload);
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', sign(body, WEBHOOK_SECRET))
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, action: 'deleted', tenants_cleaned: 2 });
    expect(mockIntegrationDelete).toHaveBeenCalledTimes(2);
    expect(mockIntegrationDelete).toHaveBeenCalledWith(TENANT_ID, 'github');
    expect(mockIntegrationDelete).toHaveBeenCalledWith(TENANT_ID_2, 'github');
  });

  it('installation.deleted — continues cleanup if one tenant fails', async () => {
    const TENANT_ID_2 = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';
    mockFindManyByExternalId.mockResolvedValue([
      { id: 'int-1', tenant_id: TENANT_ID, provider: 'github', external_id: INSTALLATION_ID },
      { id: 'int-2', tenant_id: TENANT_ID_2, provider: 'github', external_id: INSTALLATION_ID },
    ]);
    mockIntegrationDelete.mockRejectedValueOnce(new Error('DB error')).mockResolvedValue(undefined);
    mockSecretDelete.mockResolvedValue(true);

    const payload = makeInstallationPayload('deleted');
    const body = JSON.stringify(payload);
    const app = makeApp();

    const res = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'installation')
      .set('x-hub-signature-256', sign(body, WEBHOOK_SECRET))
      .set('content-type', 'application/json')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true, action: 'deleted', tenants_cleaned: 1 });
    expect(mockIntegrationDelete).toHaveBeenCalledTimes(2);
  });
});
