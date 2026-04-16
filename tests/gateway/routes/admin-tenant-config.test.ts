import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminTenantConfigRoutes } from '../../../src/gateway/routes/admin-tenant-config.js';

const ADMIN_KEY = 'test-admin-key';
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const NOW = new Date('2026-01-01T00:00:00Z');

function makeTenant(config: unknown = null) {
  return {
    id: TENANT_ID,
    name: 'Acme',
    slug: 'acme',
    slack_team_id: null,
    config,
    status: 'active',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const app = express();
  app.use(express.json());
  app.use(
    adminTenantConfigRoutes({
      prisma: {
        tenant: {
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          update: vi.fn(),
          ...((prismaOverrides.tenant as Record<string, unknown>) ?? {}),
        },
      } as never,
    }),
  );
  return app;
}

describe('GET /admin/tenants/:tenantId/config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/config`);
    expect(res.status).toBe(401);
  });

  it('400 when tenantId is not a UUID', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/admin/tenants/not-a-uuid/config')
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
  });

  it('404 when tenant not found', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(null) } });
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/config`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
  });

  it('200 returns empty object when config is null', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant(null)) } });
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/config`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it('200 returns existing config', async () => {
    const config = { summary: { target_channel: 'C123', channel_ids: ['C456'] } };
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant(config)) } });
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/config`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(config);
  });
});

describe('PATCH /admin/tenants/:tenantId/config', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/config`)
      .send({ summary: { channel_ids: ['C456'] } });
    expect(res.status).toBe(401);
  });

  it('404 when tenant not found', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(null) } });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/config`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ summary: { channel_ids: ['C456'] } });
    expect(res.status).toBe(404);
  });

  it('200 deep merges config — existing fields preserved', async () => {
    const existingConfig = { summary: { target_channel: 'C123' } };
    const mergedConfig = { summary: { target_channel: 'C123', channel_ids: ['C456', 'C789'] } };
    const updatedTenant = makeTenant(mergedConfig);
    const app = makeApp({
      tenant: {
        findFirst: vi.fn().mockResolvedValue(makeTenant(existingConfig)),
        update: vi.fn().mockResolvedValue(updatedTenant),
      },
    });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/config`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ summary: { channel_ids: ['C456', 'C789'] } });
    expect(res.status).toBe(200);
    expect(res.body.summary.target_channel).toBe('C123');
    expect(res.body.summary.channel_ids).toEqual(['C456', 'C789']);
  });

  it('200 merges into empty config', async () => {
    const mergedConfig = { summary: { channel_ids: ['C456'] } };
    const updatedTenant = makeTenant(mergedConfig);
    const app = makeApp({
      tenant: {
        findFirst: vi.fn().mockResolvedValue(makeTenant(null)),
        update: vi.fn().mockResolvedValue(updatedTenant),
      },
    });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/config`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ summary: { channel_ids: ['C456'] } });
    expect(res.status).toBe(200);
    expect(res.body.summary.channel_ids).toEqual(['C456']);
  });
});
