import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminTenantSecretsRoutes } from '../../../src/gateway/routes/admin-tenant-secrets.js';

const ADMIN_KEY = 'test-admin-key';
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const OTHER_TENANT_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';
const NOW = new Date('2026-01-01T00:00:00Z');

function makeTenant(id = TENANT_ID) {
  return {
    id,
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

function makeSecretRecord(key: string) {
  return {
    id: 'secret-id',
    tenant_id: TENANT_ID,
    key,
    ciphertext: 'enc-data',
    iv: 'iv-data',
    auth_tag: 'tag-data',
    created_at: NOW,
    updated_at: NOW,
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const app = express();
  app.use(express.json());
  app.use(
    adminTenantSecretsRoutes({
      prisma: {
        tenant: {
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          ...((prismaOverrides.tenant as Record<string, unknown>) ?? {}),
        },
        tenantSecret: {
          upsert: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          delete: vi.fn(),
          ...((prismaOverrides.tenantSecret as Record<string, unknown>) ?? {}),
        },
      } as never,
    }),
  );
  return app;
}

describe('GET /admin/tenants/:tenantId/secrets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/secrets`);
    expect(res.status).toBe(401);
  });

  it('400 when tenantId is not a UUID', async () => {
    const app = makeApp();
    const res = await request(app)
      .get('/admin/tenants/not-a-uuid/secrets')
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
  });

  it('404 when tenant not found', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(null) } });
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/secrets`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
  });

  it('200 returns secret metadata without plaintext', async () => {
    const secretRecord = makeSecretRecord('slack_bot_token');
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) },
      tenantSecret: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ key: secretRecord.key, updated_at: secretRecord.updated_at }]),
      },
    });
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/secrets`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.secrets).toHaveLength(1);
    expect(res.body.secrets[0]).toEqual({
      key: 'slack_bot_token',
      is_set: true,
      updated_at: NOW.toISOString(),
    });
    expect(JSON.stringify(res.body)).not.toContain('ciphertext');
    expect(JSON.stringify(res.body)).not.toContain('iv');
    expect(JSON.stringify(res.body)).not.toContain('auth_tag');
  });

  it('cross-tenant: 404 when tenant does not match', async () => {
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(null) },
    });
    const res = await request(app)
      .get(`/admin/tenants/${OTHER_TENANT_ID}/secrets`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
  });
});

describe('PUT /admin/tenants/:tenantId/secrets/:key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app)
      .put(`/admin/tenants/${TENANT_ID}/secrets/slack_bot_token`)
      .send({ value: 'xoxb-test' });
    expect(res.status).toBe(401);
  });

  it('400 when key has invalid characters', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) } });
    const res = await request(app)
      .put(`/admin/tenants/${TENANT_ID}/secrets/INVALID-KEY`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ value: 'xoxb-test' });
    expect(res.status).toBe(400);
  });

  it('400 when body is missing value', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) } });
    const res = await request(app)
      .put(`/admin/tenants/${TENANT_ID}/secrets/slack_bot_token`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({});
    expect(res.status).toBe(400);
  });

  it('404 when tenant not found', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(null) } });
    const res = await request(app)
      .put(`/admin/tenants/${TENANT_ID}/secrets/slack_bot_token`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ value: 'xoxb-test' });
    expect(res.status).toBe(404);
  });

  it('200 returns metadata without plaintext', async () => {
    const secretRecord = makeSecretRecord('slack_bot_token');
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) },
      tenantSecret: {
        upsert: vi.fn().mockResolvedValue(secretRecord),
      },
    });
    const res = await request(app)
      .put(`/admin/tenants/${TENANT_ID}/secrets/slack_bot_token`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ value: 'xoxb-secret-value' });
    expect(res.status).toBe(200);
    expect(res.body.key).toBe('slack_bot_token');
    expect(res.body.is_set).toBe(true);
    expect(res.body.updated_at).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('xoxb-secret-value');
    expect(JSON.stringify(res.body)).not.toContain('ciphertext');
  });
});

describe('DELETE /admin/tenants/:tenantId/secrets/:key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app).delete(`/admin/tenants/${TENANT_ID}/secrets/slack_bot_token`);
    expect(res.status).toBe(401);
  });

  it('404 when tenant not found', async () => {
    const app = makeApp({ tenant: { findFirst: vi.fn().mockResolvedValue(null) } });
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/secrets/slack_bot_token`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
  });

  it('404 when secret not found', async () => {
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) },
      tenantSecret: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/secrets/nonexistent_key`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
  });

  it('204 on successful delete', async () => {
    const secretRecord = makeSecretRecord('slack_bot_token');
    const app = makeApp({
      tenant: { findFirst: vi.fn().mockResolvedValue(makeTenant()) },
      tenantSecret: {
        findUnique: vi.fn().mockResolvedValue(secretRecord),
        delete: vi.fn().mockResolvedValue(secretRecord),
      },
    });
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/secrets/slack_bot_token`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(204);
  });
});
