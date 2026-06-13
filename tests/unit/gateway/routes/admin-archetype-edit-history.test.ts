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

const HISTORY_ID = 'e2e2e2e2-0000-4000-8000-000000000002';

function makeCurrentArchetype(overrides: Record<string, unknown> = {}) {
  return {
    id: ARCHETYPE_ID,
    tenant_id: TENANT_A,
    role_name: 'persona-bot',
    model: 'deepseek/deepseek-v4-flash',
    temperature: 1.0,
    vm_size: 'performance-1x',
    concurrency_limit: 3,
    identity: 'Current identity',
    execution_steps: 'Current steps',
    delivery_steps: 'Current delivery',
    overview: { summary: 'current' },
    risk_model: { approval_required: true, timeout_hours: 24 },
    tool_registry: { tools: ['tsx /tools/slack/post.ts'] },
    trigger_sources: { type: 'manual' },
    input_schema: [],
    deleted_at: null,
    ...overrides,
  };
}

function makeTargetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: HISTORY_ID,
    archetype_id: ARCHETYPE_ID,
    tenant_id: TENANT_A,
    request_text: 'Earlier edit',
    before_json: {
      identity: 'Original identity',
      execution_steps: 'Original steps',
      delivery_steps: 'Original delivery',
      overview: { summary: 'original' },
      risk_model: { approval_required: false, timeout_hours: 24 },
      tool_registry: { tools: ['tsx /tools/slack/read.ts'] },
      trigger_sources: { type: 'manual' },
      input_schema: [],
      model: 'minimax/minimax-m2.7',
      temperature: 0.5,
      role_name: 'old-name',
      vm_size: 'shared-cpu-1x',
      concurrency_limit: 99,
    },
    after_json: { identity: 'Current identity' },
    changed_fields: ['identity'],
    kind: 'edit',
    actor_user_id: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    deleted_at: null,
    ...overrides,
  };
}

describe('POST /admin/tenants/:tenantId/archetypes/:archetypeId/edit-history/:historyId/revert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState = { isServiceToken: true };
  });

  it('200 — restores allowlisted fields from target before_json; appends a revert row; leaves target row unchanged', async () => {
    const historyFindFirst = vi.fn().mockResolvedValue(makeTargetRow());
    const archetypeFindFirst = vi.fn().mockResolvedValue(makeCurrentArchetype());
    const historyUpdate = vi.fn();
    const historyDelete = vi.fn();
    const archetypeUpdate = vi
      .fn()
      .mockImplementation(({ data }) => Promise.resolve({ ...makeCurrentArchetype(), ...data }));
    const historyCreate = vi
      .fn()
      .mockImplementation(({ data }) =>
        Promise.resolve({ id: 'new-revert-row', created_at: new Date(), ...data }),
      );

    const app = makeApp({
      archetype: { findFirst: archetypeFindFirst, update: archetypeUpdate },
      archetypeEditHistory: {
        findFirst: historyFindFirst,
        create: historyCreate,
        update: historyUpdate,
        delete: historyDelete,
      },
    });

    const res = await request(app).post(
      `/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history/${HISTORY_ID}/revert`,
    );

    expect(res.status).toBe(200);

    const updateData = archetypeUpdate.mock.calls[0][0].data;
    expect(updateData.identity).toBe('Original identity');
    expect(updateData.execution_steps).toBe('Original steps');
    expect(updateData.delivery_steps).toBe('Original delivery');
    expect(updateData.overview).toEqual({ summary: 'original' });
    expect(updateData.risk_model).toEqual({ approval_required: false, timeout_hours: 24 });
    expect(updateData.tool_registry).toEqual({ tools: ['tsx /tools/slack/read.ts'] });

    expect(res.body.archetype.identity).toBe('Original identity');

    expect(historyCreate).toHaveBeenCalledTimes(1);
    const createData = historyCreate.mock.calls[0][0].data;
    expect(createData.kind).toBe('revert');

    expect(historyUpdate).not.toHaveBeenCalled();
    expect(historyDelete).not.toHaveBeenCalled();
  });

  it('does NOT restore disallowed fields (model, temperature, role_name, vm_size, concurrency_limit)', async () => {
    const historyFindFirst = vi.fn().mockResolvedValue(makeTargetRow());
    const archetypeFindFirst = vi.fn().mockResolvedValue(makeCurrentArchetype());
    const archetypeUpdate = vi.fn().mockResolvedValue(makeCurrentArchetype());
    const historyCreate = vi.fn().mockResolvedValue(makeTargetRow({ kind: 'revert' }));

    const app = makeApp({
      archetype: { findFirst: archetypeFindFirst, update: archetypeUpdate },
      archetypeEditHistory: { findFirst: historyFindFirst, create: historyCreate },
    });

    const res = await request(app).post(
      `/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history/${HISTORY_ID}/revert`,
    );

    expect(res.status).toBe(200);
    const updateData = archetypeUpdate.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty('model');
    expect(updateData).not.toHaveProperty('temperature');
    expect(updateData).not.toHaveProperty('role_name');
    expect(updateData).not.toHaveProperty('vm_size');
    expect(updateData).not.toHaveProperty('concurrency_limit');

    const createData = historyCreate.mock.calls[0][0].data;
    expect(createData.after_json).not.toHaveProperty('model');
    expect(createData.after_json).not.toHaveProperty('temperature');
    expect(createData.after_json).not.toHaveProperty('role_name');
  });

  it('records the before snapshot (current state) and computed changed_fields', async () => {
    const historyFindFirst = vi.fn().mockResolvedValue(makeTargetRow());
    const archetypeFindFirst = vi.fn().mockResolvedValue(makeCurrentArchetype());
    const archetypeUpdate = vi.fn().mockResolvedValue(makeCurrentArchetype());
    const historyCreate = vi.fn().mockResolvedValue(makeTargetRow({ kind: 'revert' }));

    const app = makeApp({
      archetype: { findFirst: archetypeFindFirst, update: archetypeUpdate },
      archetypeEditHistory: { findFirst: historyFindFirst, create: historyCreate },
    });

    await request(app).post(
      `/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history/${HISTORY_ID}/revert`,
    );

    const createData = historyCreate.mock.calls[0][0].data;
    expect(createData.before_json.identity).toBe('Current identity');
    expect(createData.changed_fields).toContain('identity');
    expect(createData.changed_fields).toContain('execution_steps');
    expect(createData.changed_fields).toContain('risk_model');
    expect(createData.request_text).toContain('Revert to change from');
  });

  it('actor_user_id is set from req.auth.id for JWT callers', async () => {
    authState = { auth: { id: USER_ID } };
    const historyFindFirst = vi.fn().mockResolvedValue(makeTargetRow());
    const archetypeFindFirst = vi.fn().mockResolvedValue(makeCurrentArchetype());
    const archetypeUpdate = vi.fn().mockResolvedValue(makeCurrentArchetype());
    const historyCreate = vi.fn().mockResolvedValue(makeTargetRow({ kind: 'revert' }));

    const app = makeApp({
      archetype: { findFirst: archetypeFindFirst, update: archetypeUpdate },
      archetypeEditHistory: { findFirst: historyFindFirst, create: historyCreate },
    });

    await request(app).post(
      `/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history/${HISTORY_ID}/revert`,
    );

    expect(historyCreate.mock.calls[0][0].data.actor_user_id).toBe(USER_ID);
  });

  it('actor_user_id is null for SERVICE_TOKEN callers', async () => {
    authState = { isServiceToken: true };
    const historyFindFirst = vi.fn().mockResolvedValue(makeTargetRow());
    const archetypeFindFirst = vi.fn().mockResolvedValue(makeCurrentArchetype());
    const archetypeUpdate = vi.fn().mockResolvedValue(makeCurrentArchetype());
    const historyCreate = vi.fn().mockResolvedValue(makeTargetRow({ kind: 'revert' }));

    const app = makeApp({
      archetype: { findFirst: archetypeFindFirst, update: archetypeUpdate },
      archetypeEditHistory: { findFirst: historyFindFirst, create: historyCreate },
    });

    await request(app).post(
      `/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history/${HISTORY_ID}/revert`,
    );

    expect(historyCreate.mock.calls[0][0].data.actor_user_id).toBeNull();
  });

  it('404 — target history row not found (cross-tenant revert blocked; archetype unchanged)', async () => {
    const historyFindFirst = vi.fn().mockResolvedValue(null);
    const archetypeFindFirst = vi.fn();
    const archetypeUpdate = vi.fn();
    const historyCreate = vi.fn();

    const app = makeApp({
      archetype: { findFirst: archetypeFindFirst, update: archetypeUpdate },
      archetypeEditHistory: { findFirst: historyFindFirst, create: historyCreate },
    });

    const res = await request(app).post(
      `/admin/tenants/${TENANT_B}/archetypes/${ARCHETYPE_ID}/edit-history/${HISTORY_ID}/revert`,
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(historyFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: HISTORY_ID,
          archetype_id: ARCHETYPE_ID,
          tenant_id: TENANT_B,
          deleted_at: null,
        },
      }),
    );
    expect(archetypeUpdate).not.toHaveBeenCalled();
    expect(historyCreate).not.toHaveBeenCalled();
  });

  it('404 — archetype not found for this tenant', async () => {
    const historyFindFirst = vi.fn().mockResolvedValue(makeTargetRow());
    const archetypeFindFirst = vi.fn().mockResolvedValue(null);
    const archetypeUpdate = vi.fn();
    const historyCreate = vi.fn();

    const app = makeApp({
      archetype: { findFirst: archetypeFindFirst, update: archetypeUpdate },
      archetypeEditHistory: { findFirst: historyFindFirst, create: historyCreate },
    });

    const res = await request(app).post(
      `/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history/${HISTORY_ID}/revert`,
    );

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
    expect(archetypeUpdate).not.toHaveBeenCalled();
    expect(historyCreate).not.toHaveBeenCalled();
  });

  it('400 — invalid historyId UUID is rejected', async () => {
    const historyFindFirst = vi.fn();
    const app = makeApp({
      archetype: { findFirst: vi.fn(), update: vi.fn() },
      archetypeEditHistory: { findFirst: historyFindFirst, create: vi.fn() },
    });

    const res = await request(app).post(
      `/admin/tenants/${TENANT_A}/archetypes/${ARCHETYPE_ID}/edit-history/not-a-uuid/revert`,
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
    expect(historyFindFirst).not.toHaveBeenCalled();
  });
});
