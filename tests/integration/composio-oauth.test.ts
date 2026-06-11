import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { composioOAuthRoutes } from '../../src/gateway/routes/composio-oauth.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const SERVICE_TOKEN = 'test-service-token-composio';
const FAKE_REDIRECT_URL = 'https://connect.composio.dev/link/lk_fake12345';

const FAKE_AUTH_CONFIG_ID = 'ac_fake_notion';

function makeApp(overrides: Parameters<typeof composioOAuthRoutes>[0] = {}) {
  const linkMock = vi.fn().mockResolvedValue({
    id: 'ca_fake',
    status: 'INITIATED',
    redirectUrl: FAKE_REDIRECT_URL,
  });

  const listAuthConfigsMock = vi.fn().mockResolvedValue({
    items: [{ id: FAKE_AUTH_CONFIG_ID, toolkit: { slug: 'notion' } }],
  });

  const app = express();
  app.use(express.json());
  app.use(
    composioOAuthRoutes({
      composio: {
        connectedAccounts: { link: linkMock },
        authConfigs: { list: listAuthConfigsMock },
      } as never,
      ...overrides,
    }),
  );
  return { app, linkMock, listAuthConfigsMock };
}

describe('GET /admin/tenants/:tenantId/composio/connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERVICE_TOKEN = SERVICE_TOKEN;
    process.env.COMPOSIO_API_KEY = 'test-composio-api-key';
  });

  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
  });

  it('returns 200 with { url } shape for an allowed toolkit', async () => {
    const { app, linkMock } = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/composio/connect?toolkit=notion`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ url: FAKE_REDIRECT_URL });
    expect(typeof res.body.url).toBe('string');
    expect(linkMock).toHaveBeenCalledWith(
      `tenant_${TENANT_ID}`,
      FAKE_AUTH_CONFIG_ID,
      expect.objectContaining({
        allowMultiple: true,
        callbackUrl: expect.stringContaining(
          `/admin/tenants/${TENANT_ID}/composio/callback?toolkit=notion`,
        ),
      }),
    );
  });

  it('does not leak COMPOSIO_API_KEY in the response', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/composio/connect?toolkit=notion`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(JSON.stringify(res.body)).not.toContain('test-composio-api-key');
  });

  it('returns 400 when no auth config exists for the toolkit', async () => {
    const { app, linkMock } = makeApp({
      composio: {
        connectedAccounts: { link: vi.fn() },
        authConfigs: { list: vi.fn().mockResolvedValue({ items: [] }) },
      } as never,
    });
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/composio/connect?toolkit=notion`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TOOLKIT_NOT_CONFIGURED');
    expect(linkMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a denied toolkit', async () => {
    const { app, linkMock } = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/composio/connect?toolkit=github`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('TOOLKIT_DENIED');
    expect(linkMock).not.toHaveBeenCalled();
  });

  it('returns 400 when toolkit query param is missing', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/composio/connect`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('returns 401 without an auth token', async () => {
    const { app, linkMock } = makeApp();
    const res = await request(app).get(
      `/admin/tenants/${TENANT_ID}/composio/connect?toolkit=notion`,
    );

    expect(res.status).toBe(401);
    expect(linkMock).not.toHaveBeenCalled();
  });
});
