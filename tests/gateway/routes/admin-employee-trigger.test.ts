import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminEmployeeTriggerRoutes } from '../../../src/gateway/routes/admin-employee-trigger.js';
import * as dispatcher from '../../../src/gateway/services/employee-dispatcher.js';

vi.mock('../../../src/gateway/services/employee-dispatcher.js');

const TENANT = 'a0000000-0000-4000-8000-000000000001';
const ADMIN_KEY = 'test-admin-key';

function makeApp() {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use(adminEmployeeTriggerRoutes({ prisma: {} as never, inngest: { send: vi.fn() } }));
  return app;
}

describe('POST /admin/tenants/:tenantId/employees/:slug/trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('401 when X-Admin-Key header missing', async () => {
    const app = makeApp();
    const res = await request(app).post(
      `/admin/tenants/${TENANT}/employees/daily-summarizer/trigger`,
    );
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized' });
  });

  it('401 when X-Admin-Key header wrong', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/employees/daily-summarizer/trigger`)
      .set('X-Admin-Key', 'wrong-key');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized' });
  });

  it('400 when tenantId is not a UUID', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/admin/tenants/not-a-uuid/employees/daily-summarizer/trigger')
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'INVALID_REQUEST' });
  });

  it('400 when slug contains uppercase', async () => {
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/employees/Daily-Summarizer/trigger`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'INVALID_REQUEST' });
  });

  it('202 + task_id + status_url on successful dispatch', async () => {
    vi.mocked(dispatcher.dispatchEmployee).mockResolvedValue({
      kind: 'dispatched',
      taskId: 'task-123',
      archetypeId: 'arch-456',
    });
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/employees/daily-summarizer/trigger`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({
      task_id: 'task-123',
      status_url: `/admin/tenants/${TENANT}/tasks/task-123`,
    });
  });

  it('200 + valid:true + would_fire when dry_run=true', async () => {
    vi.mocked(dispatcher.dispatchEmployee).mockResolvedValue({
      kind: 'dry_run',
      archetypeId: 'arch-456',
      wouldFire: {
        eventName: 'employee/task.dispatched',
        data: { taskId: '<pending>', archetypeId: 'arch-456' },
        externalId: 'manual-abc',
      },
    });
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/employees/daily-summarizer/trigger?dry_run=true`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      valid: true,
      would_fire: {
        event_name: 'employee/task.dispatched',
        data: { taskId: '<pending>', archetypeId: 'arch-456' },
        external_id: 'manual-abc',
      },
      archetype_id: 'arch-456',
    });
  });

  it('404 when dispatcher returns ARCHETYPE_NOT_FOUND', async () => {
    vi.mocked(dispatcher.dispatchEmployee).mockResolvedValue({
      kind: 'error',
      code: 'ARCHETYPE_NOT_FOUND',
      message: 'No archetype found',
    });
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/employees/unknown-slug/trigger`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'NOT_FOUND', message: 'No archetype found' });
  });

  it('501 when dispatcher returns UNSUPPORTED_RUNTIME', async () => {
    vi.mocked(dispatcher.dispatchEmployee).mockResolvedValue({
      kind: 'error',
      code: 'UNSUPPORTED_RUNTIME',
      message: 'Manual trigger for runtime opencode is not yet supported',
    });
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/employees/daily-summarizer/trigger`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({
      error: 'NOT_IMPLEMENTED',
      message: 'Manual trigger for runtime opencode is not yet supported',
    });
  });

  it('500 when dispatcher throws unexpected error', async () => {
    vi.mocked(dispatcher.dispatchEmployee).mockRejectedValue(new Error('DB connection lost'));
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/employees/daily-summarizer/trigger`)
      .set('X-Admin-Key', ADMIN_KEY);
    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: 'INTERNAL_ERROR' });
  });
});
