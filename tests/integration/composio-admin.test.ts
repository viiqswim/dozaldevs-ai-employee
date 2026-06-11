import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { composioAdminRoutes } from '../../src/gateway/routes/composio-admin.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const SERVICE_TOKEN = 'test-service-token-composio-admin';

interface PrismaMocks {
  composioFindMany: ReturnType<typeof vi.fn>;
  composioUpdateMany: ReturnType<typeof vi.fn>;
  callsFindMany: ReturnType<typeof vi.fn>;
}

function makeApp(mocks: Partial<PrismaMocks> = {}) {
  const composioFindMany = mocks.composioFindMany ?? vi.fn().mockResolvedValue([]);
  const composioUpdateMany = mocks.composioUpdateMany ?? vi.fn().mockResolvedValue({ count: 1 });
  const callsFindMany = mocks.callsFindMany ?? vi.fn().mockResolvedValue([]);

  const prisma = {
    composioConnection: { findMany: composioFindMany, updateMany: composioUpdateMany },
    taskComposioCall: { findMany: callsFindMany },
  } as never;

  const app = express();
  app.use(express.json());
  app.use(composioAdminRoutes({ prisma }));
  return { app, composioFindMany, composioUpdateMany, callsFindMany };
}

describe('GET /admin/tenants/:tenantId/composio/connections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERVICE_TOKEN = SERVICE_TOKEN;
  });

  it('returns an empty array when there are no connections', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/composio/connections`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns only the public connection fields and never internal session ids', async () => {
    const connectedAt = new Date('2026-06-10T12:00:00.000Z');
    const composioFindMany = vi.fn().mockResolvedValue([
      {
        id: 'conn-1',
        tenant_id: TENANT_ID,
        toolkit: 'notion',
        status: 'active',
        connected_at: connectedAt,
        disconnected_at: null,
        deleted_at: null,
      },
    ]);
    const { app } = makeApp({ composioFindMany });
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/composio/connections`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { toolkit: 'notion', status: 'active', connected_at: connectedAt.toISOString() },
    ]);
    expect(JSON.stringify(res.body)).not.toContain(`tenant_${TENANT_ID}`);
    expect(JSON.stringify(res.body)).not.toContain('conn-1');
  });

  it('returns 401 without an auth token', async () => {
    const { app, composioFindMany } = makeApp();
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/composio/connections`);

    expect(res.status).toBe(401);
    expect(composioFindMany).not.toHaveBeenCalled();
  });
});

describe('DELETE /admin/tenants/:tenantId/composio/connections/:toolkit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERVICE_TOKEN = SERVICE_TOKEN;
  });

  it('soft-deletes the connection and returns 204', async () => {
    const { app, composioUpdateMany } = makeApp();
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_ID}/composio/connections/notion`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
    expect(composioUpdateMany).toHaveBeenCalledWith({
      where: { tenant_id: TENANT_ID, toolkit: 'notion' },
      data: { deleted_at: expect.any(Date) },
    });
  });

  it('returns 401 without an auth token', async () => {
    const { app, composioUpdateMany } = makeApp();
    const res = await request(app).delete(
      `/admin/tenants/${TENANT_ID}/composio/connections/notion`,
    );

    expect(res.status).toBe(401);
    expect(composioUpdateMany).not.toHaveBeenCalled();
  });
});

describe('GET /admin/tenants/:tenantId/composio/usage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SERVICE_TOKEN = SERVICE_TOKEN;
  });

  it('returns an empty array when there are no calls', async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/composio/usage`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('groups call counts by toolkit and date', async () => {
    const callsFindMany = vi.fn().mockResolvedValue([
      { toolkit: 'notion', called_at: new Date('2026-06-10T09:00:00.000Z') },
      { toolkit: 'notion', called_at: new Date('2026-06-10T18:00:00.000Z') },
      { toolkit: 'notion', called_at: new Date('2026-06-09T10:00:00.000Z') },
      { toolkit: 'gmail', called_at: new Date('2026-06-10T11:00:00.000Z') },
    ]);
    const { app } = makeApp({ callsFindMany });
    const res = await request(app)
      .get(`/admin/tenants/${TENANT_ID}/composio/usage`)
      .set('Authorization', `Bearer ${SERVICE_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { toolkit: 'notion', date: '2026-06-10', count: 2 },
        { toolkit: 'notion', date: '2026-06-09', count: 1 },
        { toolkit: 'gmail', date: '2026-06-10', count: 1 },
      ]),
    );
    expect(res.body).toHaveLength(3);
  });

  it('returns 401 without an auth token', async () => {
    const { app, callsFindMany } = makeApp();
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/composio/usage`);

    expect(res.status).toBe(401);
    expect(callsFindMany).not.toHaveBeenCalled();
  });
});
