import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminIntegrationsRoutes } from '../../../../src/gateway/routes/admin-integrations.js';

vi.mock('../../../../src/gateway/middleware/auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction): void => {
    (req as Request & { isServiceToken?: boolean }).isServiceToken = true;
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
}));

const TENANT_A = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const TENANT_B = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';
const INTEGRATION_A_ID = 'int-aaaa-0001';
const INTEGRATION_B_ID = 'int-bbbb-0002';

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    tenantIntegration: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    tenantSecret: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
  TenantRole: { OWNER: 'OWNER', ADMIN: 'ADMIN', MEMBER: 'MEMBER', VIEWER: 'VIEWER' },
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(adminIntegrationsRoutes({ prisma: mockPrisma as never }));
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();

  mockPrisma.tenantIntegration.findFirst.mockImplementation(
    ({ where }: { where: { tenant_id: string } }) => {
      if (where.tenant_id === TENANT_A) {
        return Promise.resolve({ id: INTEGRATION_A_ID, tenant_id: TENANT_A, provider: 'slack' });
      }
      if (where.tenant_id === TENANT_B) {
        return Promise.resolve({ id: INTEGRATION_B_ID, tenant_id: TENANT_B, provider: 'slack' });
      }
      return Promise.resolve(null);
    },
  );

  mockPrisma.tenantIntegration.update.mockResolvedValue({});
  mockPrisma.tenantSecret.findUnique.mockResolvedValue(null);
  mockPrisma.tenantSecret.update.mockResolvedValue({});
});

describe('DELETE /admin/tenants/:tenantId/integrations/slack', () => {
  it('disconnects only the target tenant — tenant B integration untouched', async () => {
    const app = makeApp();

    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_A}/integrations/slack`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ disconnected: true, tenant_id: TENANT_A });

    const updateCalls = mockPrisma.tenantIntegration.update.mock.calls as Array<
      [{ where: { id: string }; data: unknown }]
    >;
    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0][0].where.id).toBe(INTEGRATION_A_ID);

    const allUpdatedIds = updateCalls.map((c) => c[0].where.id);
    expect(allUpdatedIds).not.toContain(INTEGRATION_B_ID);
  });

  it('returns 200 even when no integration exists for the tenant', async () => {
    mockPrisma.tenantIntegration.findFirst.mockResolvedValue(null);

    const app = makeApp();
    const res = await request(app)
      .delete(`/admin/tenants/${TENANT_A}/integrations/slack`)
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(mockPrisma.tenantIntegration.update).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid tenantId', async () => {
    const app = makeApp();
    const res = await request(app)
      .delete('/admin/tenants/not-a-uuid/integrations/slack')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(400);
  });

  it('disconnecting tenant A does not affect tenant B on the same workspace', async () => {
    const app = makeApp();

    await request(app)
      .delete(`/admin/tenants/${TENANT_A}/integrations/slack`)
      .set('Authorization', 'Bearer test-token');

    const findFirstCalls = mockPrisma.tenantIntegration.findFirst.mock.calls as Array<
      [{ where: { tenant_id: string } }]
    >;
    const queriedTenants = findFirstCalls.map((c) => c[0].where.tenant_id);
    expect(queriedTenants).not.toContain(TENANT_B);
  });
});
