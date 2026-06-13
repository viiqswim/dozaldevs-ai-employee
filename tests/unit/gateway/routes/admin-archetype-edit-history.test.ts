import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminArchetypeEditHistoryRoutes } from '../../../../src/gateway/routes/admin-archetype-edit-history.js';

type AuthState = { isServiceToken?: boolean; auth?: { id: string } };
let authState: AuthState = { isServiceToken: true };

vi.mock('../../../../src/gateway/middleware/auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction): void => {
    Object.assign(req, authState);
    next();
  },
}));

vi.mock('../../../../src/gateway/middleware/authz.js', () => ({
  requireAuth: (_req: Request, _res: Response, next: NextFunction): void => {
    next();
  },
  requireTenantRole:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    },
  requirePermission:
    () =>
    (_req: Request, _res: Response, next: NextFunction): void => {
      next();
    },
}));

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const ARCHETYPE_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const USER_ID = 'c0ffee00-0000-4000-8000-000000000001';

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    request_text: 'Make the persona friendlier',
    before_json: { identity: 'Old' },
    after_json: { identity: 'New' },
    changed_fields: ['identity'],
    kind: 'edit',
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1d1d1d1-0000-4000-8000-000000000001',
    archetype_id: ARCHETYPE_ID,
    tenant_id: TENANT_A,
    request_text: 'Make the persona friendlier',
    before_json: { identity: 'Old' },
    after_json: { identity: 'New' },
    changed_fields: ['identity'],
    kind: 'edit',
    actor_user_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

function makeApp(prismaOverrides: Record<string, unknown>) {
  const app = express();
  app.use(express.json());
  app.use(adminArchetypeEditHistoryRoutes({ prisma: prismaOverrides as never }));
  return app;
}

describe('POST /admin/tenants/:tenantId/archetypes/:archetypeId/edit-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { isServiceToken: true };
  });

  it('201 — records a row and returns it (happy path)', async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: ARCHETYPE_ID, tenant_id: TENANT_A });
    const create = vi.fn().mockResolvedValue(makeRow());

    const app = makeApp({ archetype: { findFirst }, archetypeEditHistory: { create } });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history`)
      .send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.archetype_id).toBe(ARCHETYPE_ID);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          archetype_id: ARCHETYPE_ID,
          tenant_id: TENANT_A,
          kind: 'edit',
          changed_fields: ['identity'],
        }),
      }),
    );
  });

  it('actor_user_id is set from req.auth.id for JWT callers', async () => {
    authState = { auth: { id: USER_ID } };
    const findFirst = vi.fn().mockResolvedValue({ id: ARCHETYPE_ID, tenant_id: TENANT_A });
    const create = vi.fn().mockResolvedValue(makeRow({ actor_user_id: USER_ID }));

    const app = makeApp({ archetype: { findFirst }, archetypeEditHistory: { create } });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history`)
      .send(validBody());

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actor_user_id: USER_ID }) }),
    );
  });

  it('actor_user_id is null for SERVICE_TOKEN callers', async () => {
    authState = { isServiceToken: true };
    const findFirst = vi.fn().mockResolvedValue({ id: ARCHETYPE_ID, tenant_id: TENANT_A });
    const create = vi.fn().mockResolvedValue(makeRow({ actor_user_id: null }));

    const app = makeApp({ archetype: { findFirst }, archetypeEditHistory: { create } });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history`)
      .send(validBody());

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actor_user_id: null }) }),
    );
  });

  it('404 — archetype not found for this tenant (cross-tenant write blocked)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn();

    const app = makeApp({ archetype: { findFirst }, archetypeEditHistory: { create } });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_B}/archetypes/${ARCHETYPE_ID}/edit-history`)
      .send(validBody());

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(create).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ARCHETYPE_ID, tenant_id: TENANT_B, deleted_at: null },
      }),
    );
  });

  it('400 — invalid kind is rejected', async () => {
    const findFirst = vi.fn();
    const create = vi.fn();

    const app = makeApp({ archetype: { findFirst }, archetypeEditHistory: { create } });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history`)
      .send(validBody({ kind: 'delete' }));

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    expect(create).not.toHaveBeenCalled();
  });

  it('400 — missing changed_fields is rejected', async () => {
    const findFirst = vi.fn();
    const create = vi.fn();

    const app = makeApp({ archetype: { findFirst }, archetypeEditHistory: { create } });

    const body = validBody();
    delete (body as Record<string, unknown>).changed_fields;

    const res = await request(app)
      .post(`/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history`)
      .send(body);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('GET /admin/tenants/:tenantId/archetypes/:archetypeId/edit-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { isServiceToken: true };
  });

  it('200 — returns the tenant-scoped rows', async () => {
    const findMany = vi.fn().mockResolvedValue([makeRow()]);

    const app = makeApp({ archetypeEditHistory: { findMany } });

    const res = await request(app).get(
      `/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].tenant_id).toBe(TENANT_A);
  });

  it('list is scoped by tenant_id — tenant B never sees tenant A rows', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    const app = makeApp({ archetypeEditHistory: { findMany } });

    const res = await request(app).get(
      `/admin/tenants/${TENANT_B}/archetypes/${ARCHETYPE_ID}/edit-history`,
    );

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_id: TENANT_B, archetype_id: ARCHETYPE_ID, deleted_at: null },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
    );
  });

  it('respects ?limit and caps at 50', async () => {
    const findMany = vi.fn().mockResolvedValue([]);

    const app = makeApp({ archetypeEditHistory: { findMany } });

    const res = await request(app)
      .get(`/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history`)
      .query({ limit: '10' });

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it('400 — limit above 50 is rejected', async () => {
    const findMany = vi.fn();

    const app = makeApp({ archetypeEditHistory: { findMany } });

    const res = await request(app)
      .get(`/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history`)
      .query({ limit: '51' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('400 — invalid archetypeId UUID is rejected', async () => {
    const findMany = vi.fn();

    const app = makeApp({ archetypeEditHistory: { findMany } });

    const res = await request(app).get(
      `/admin/tenants/${TENANT_A}/archetypes/not-a-uuid/edit-history`,
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
    expect(findMany).not.toHaveBeenCalled();
  });
});
