import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library.js';
import { adminTenantsRoutes } from '../../../src/gateway/routes/admin-tenants.js';

const ADMIN_KEY = 'test-admin-key';
const TENANT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const NOW = new Date('2026-01-01T00:00:00Z');

function makeTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: TENANT_ID,
    name: 'Acme Corp',
    slug: 'acme-corp',
    slack_team_id: null,
    config: null,
    status: 'active',
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
    ...overrides,
  };
}

function makeApp(prismaOverrides: Record<string, unknown> = {}) {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const app = express();
  app.use(express.json());
  app.use(
    adminTenantsRoutes({
      prisma: {
        tenant: {
          create: vi.fn(),
          findFirst: vi.fn(),
          findUnique: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
          ...prismaOverrides,
        },
      } as never,
    }),
  );
  return app;
}

describe('POST /admin/tenants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when X-Admin-Key header missing', async () => {
    const app = makeApp();
    const res = await request(app).post('/admin/tenants').send({ name: 'Acme', slug: 'acme' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
  });

  it('401 when X-Admin-Key is wrong', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/admin/tenants')
      .set('X-Admin-Key', 'wrong-key')
      .send({ name: 'Acme', slug: 'acme' });
    expect(res.status).toBe(401);
  });

  it('400 when body is invalid (missing slug)', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/admin/tenants')
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ name: 'Acme' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('400 when slug has invalid characters', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/admin/tenants')
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ name: 'Acme', slug: 'Acme Corp' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('201 with install_link on success', async () => {
    const tenant = makeTenant();
    const create = vi.fn().mockResolvedValue(tenant);
    const app = makeApp({ create });
    const res = await request(app)
      .post('/admin/tenants')
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ name: 'Acme Corp', slug: 'acme-corp' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(TENANT_ID);
    expect(res.body.slug).toBe('acme-corp');
    expect(res.body.install_link).toBe(`/slack/install?tenant=${TENANT_ID}`);
    expect(create).toHaveBeenCalledOnce();
  });

  it('409 on slug collision (P2002)', async () => {
    const err = new PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '6.0.0',
    });
    const create = vi.fn().mockRejectedValue(err);
    const app = makeApp({ create });
    const res = await request(app)
      .post('/admin/tenants')
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ name: 'Acme Corp', slug: 'acme-corp' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });
});

describe('GET /admin/tenants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app).get('/admin/tenants');
    expect(res.status).toBe(401);
  });

  it('200 returns tenants array', async () => {
    const tenants = [makeTenant()];
    const findMany = vi.fn().mockResolvedValue(tenants);
    const app = makeApp({ findMany });
    const res = await request(app).get('/admin/tenants').set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.tenants).toHaveLength(1);
    expect(res.body.tenants[0].id).toBe(TENANT_ID);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deleted_at: null } }));
  });

  it('includes deleted tenants when include_deleted=true', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const app = makeApp({ findMany });
    await request(app).get('/admin/tenants?include_deleted=true').set('X-Admin-Key', ADMIN_KEY);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });
});

describe('GET /admin/tenants/:tenantId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}`);
    expect(res.status).toBe(401);
  });

  it('400 when tenantId is not a UUID', async () => {
    const app = makeApp();
    const res = await request(app).get('/admin/tenants/not-a-uuid').set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
  });

  it('404 when tenant not found', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ findFirst });
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}`).set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('200 returns tenant', async () => {
    const tenant = makeTenant();
    const findFirst = vi.fn().mockResolvedValue(tenant);
    const app = makeApp({ findFirst });
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}`).set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TENANT_ID);
  });

  it('uses findUnique when include_deleted=true', async () => {
    const tenant = makeTenant({ deleted_at: NOW });
    const findUnique = vi.fn().mockResolvedValue(tenant);
    const app = makeApp({ findUnique });
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}?include_deleted=true`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(findUnique).toHaveBeenCalledOnce();
  });
});

describe('PATCH /admin/tenants/:tenantId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app).patch(`/admin/tenants/${TENANT_ID}`).send({ name: 'New Name' });
    expect(res.status).toBe(401);
  });

  it('400 when body is empty', async () => {
    const findFirst = vi.fn().mockResolvedValue(makeTenant());
    const app = makeApp({ findFirst });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
  });

  it('404 when tenant not found', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ findFirst });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ name: 'New Name' });
    expect(res.status).toBe(404);
  });

  it('200 returns updated tenant', async () => {
    const updated = makeTenant({ name: 'New Name' });
    const findFirst = vi.fn().mockResolvedValue(makeTenant());
    const update = vi.fn().mockResolvedValue(updated);
    const app = makeApp({ findFirst, update });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('New Name');
  });
});

describe('DELETE /admin/tenants/:tenantId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app).delete(`/admin/tenants/${TENANT_ID}`);
    expect(res.status).toBe(401);
  });

  it('404 when tenant not found', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const findUnique = vi.fn().mockResolvedValue(null);
    const app = makeApp({ findFirst, findUnique });
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
  });

  it('200 soft-deletes tenant (returns deleted_at)', async () => {
    const deleted = makeTenant({ deleted_at: NOW });
    const findFirst = vi.fn().mockResolvedValue(makeTenant());
    const findUnique = vi.fn().mockResolvedValue(makeTenant());
    const update = vi.fn().mockResolvedValue(deleted);
    const app = makeApp({ findFirst, findUnique, update });
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TENANT_ID);
    expect(res.body.deleted_at).toBeDefined();
  });

  it('hard=true param is ignored — still soft-deletes', async () => {
    const deleted = makeTenant({ deleted_at: NOW });
    const findFirst = vi.fn().mockResolvedValue(makeTenant());
    const findUnique = vi.fn().mockResolvedValue(makeTenant());
    const update = vi.fn().mockResolvedValue(deleted);
    const app = makeApp({ findFirst, findUnique, update });
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}?hard=true`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.deleted_at).toBeDefined();
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('POST /admin/tenants/:tenantId/restore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when no auth', async () => {
    const app = makeApp();
    const res = await request(app).post(`/admin/tenants/${TENANT_ID}/restore`);
    expect(res.status).toBe(401);
  });

  it('400 when tenantId is not a UUID', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/admin/tenants/not-a-uuid/restore')
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
  });

  it('404 when tenant not found', async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const app = makeApp({ findUnique });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/restore`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
  });

  it('409 when slug collides on restore', async () => {
    const findUnique = vi
      .fn()
      .mockRejectedValue(
        new Error('Cannot restore tenant: slug "acme" is already taken by active tenant other-id'),
      );
    const app = makeApp({ findUnique });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/restore`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONFLICT');
  });

  it('200 returns restored tenant', async () => {
    const restored = makeTenant();
    const findUnique = vi.fn().mockResolvedValue(makeTenant({ deleted_at: NOW }));
    const update = vi.fn().mockResolvedValue(restored);
    const app = makeApp({ findUnique, update });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/restore`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TENANT_ID);
  });
});
