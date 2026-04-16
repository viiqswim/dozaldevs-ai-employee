import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminTasksRoutes } from '../../../src/gateway/routes/admin-tasks.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const TASK_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const ADMIN_KEY = 'test-admin-key';

function makeTask() {
  return {
    id: TASK_ID,
    status: 'Ready',
    source_system: 'manual',
    external_id: 'manual-some-uuid',
    archetype_id: 'arch-uuid',
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
  };
}

function makeApp(prismaFindFirst: ReturnType<typeof vi.fn>) {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use(
    adminTasksRoutes({
      prisma: { task: { findFirst: prismaFindFirst } } as never,
    }),
  );
  return app;
}

describe('GET /admin/tenants/:tenantId/tasks/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when X-Admin-Key header missing', async () => {
    const findFirst = vi.fn();
    const app = makeApp(findFirst);
    const res = await request(app).get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('400 when tenantId is not a UUID', async () => {
    const findFirst = vi.fn();
    const app = makeApp(findFirst);
    const res = await request(app)
      .get(`/admin/tenants/not-a-uuid/tasks/${TASK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('400 when id is not a UUID', async () => {
    const findFirst = vi.fn();
    const app = makeApp(findFirst);
    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/tasks/not-a-uuid`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('404 when task does not exist', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp(findFirst);
    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
  });

  it('404 when task belongs to different tenant (cross-tenant blocked)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp(findFirst);
    const res = await request(app)
      .get(`/admin/tenants/${OTHER_TENANT}/tasks/${TASK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: OTHER_TENANT }),
      }),
    );
  });

  it('200 + task object when task exists for correct tenant', async () => {
    const task = makeTask();
    const findFirst = vi.fn().mockResolvedValue(task);
    const app = makeApp(findFirst);
    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TASK_ID);
    expect(res.body.status).toBe('Ready');
    expect(res.body.source_system).toBe('manual');
    expect(res.body.external_id).toBe('manual-some-uuid');
    expect(res.body.archetype_id).toBe('arch-uuid');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: TASK_ID, tenant_id: TENANT }),
      }),
    );
  });

  it('500 when prisma throws unexpected error', async () => {
    const findFirst = vi.fn().mockRejectedValue(new Error('DB connection lost'));
    const app = makeApp(findFirst);
    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/tasks/${TASK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'INTERNAL_ERROR' });
  });
});
