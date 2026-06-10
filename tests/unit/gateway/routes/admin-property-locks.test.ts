import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { adminPropertyLockRoutes } from '../../../../src/gateway/routes/admin-property-locks.js';

vi.mock('../../../../src/gateway/middleware/auth.js', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction): void => {
    const adminKey = req.headers['x-admin-key'] as string | undefined;
    if (adminKey && adminKey === process.env.ADMIN_API_KEY) {
      (req as Request & { isServiceToken?: boolean }).isServiceToken = true;
    }
    next();
  },
}));

vi.mock('../../../../src/gateway/middleware/authz.js', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction): void => {
    if (
      (req as Request & { isServiceToken?: boolean }).isServiceToken ||
      (req as Request & { auth?: unknown }).auth
    ) {
      next();
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
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

const TENANT = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const LOCK_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const ADMIN_KEY = 'test-admin-key';

function makeLock(overrides: Record<string, unknown> = {}) {
  return {
    id: LOCK_ID,
    tenant_id: TENANT,
    property_external_id: 'prop-ext-001',
    lock_external_id: 'lock-ext-001',
    lock_name: 'Front Door',
    lock_provider: 'sifely',
    lock_role: null,
    property_type: 'HOME',
    property_name: 'Test Property',
    passcode_name: null,
    lock_metadata: null,
    created_at: new Date('2026-01-01T00:00:00Z'),
    updated_at: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeApp(
  overrides: {
    propertyLockCreate?: ReturnType<typeof vi.fn>;
    propertyLockFindMany?: ReturnType<typeof vi.fn>;
    propertyLockFindFirst?: ReturnType<typeof vi.fn>;
    propertyLockUpdate?: ReturnType<typeof vi.fn>;
    propertyLockDelete?: ReturnType<typeof vi.fn>;
  } = {},
) {
  process.env.ADMIN_API_KEY = ADMIN_KEY;
  const app = express();
  app.use(express.json());
  app.use(
    adminPropertyLockRoutes({
      prisma: {
        propertyLock: {
          create: overrides.propertyLockCreate ?? vi.fn().mockResolvedValue(makeLock()),
          findMany: overrides.propertyLockFindMany ?? vi.fn().mockResolvedValue([makeLock()]),
          findFirst: overrides.propertyLockFindFirst ?? vi.fn().mockResolvedValue(makeLock()),
          update: overrides.propertyLockUpdate ?? vi.fn().mockResolvedValue(makeLock()),
          delete: overrides.propertyLockDelete ?? vi.fn().mockResolvedValue(makeLock()),
        },
      } as never,
    }),
  );
  return app;
}

const VALID_CREATE_BODY = {
  property_external_id: 'prop-ext-001',
  lock_external_id: 'lock-ext-001',
  lock_name: 'Front Door',
  property_type: 'HOME',
  property_name: 'Test Property',
};

describe('POST /admin/tenants/:tenantId/property-locks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1. valid body → 201 with property lock object, create called with tenant_id', async () => {
    const create = vi.fn().mockResolvedValue(makeLock());
    const app = makeApp({ propertyLockCreate: create });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/property-locks`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send(VALID_CREATE_BODY);

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(LOCK_ID);
    expect(res.body.tenant_id).toBe(TENANT);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT,
          property_external_id: 'prop-ext-001',
          lock_external_id: 'lock-ext-001',
          lock_name: 'Front Door',
        }),
      }),
    );
  });

  it('2. missing required fields → 400 INVALID_REQUEST with issues', async () => {
    const create = vi.fn();
    const app = makeApp({ propertyLockCreate: create });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/property-locks`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ lock_name: 'Front Door' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_REQUEST');
    expect(Array.isArray(res.body.issues)).toBe(true);
    expect(res.body.issues.length).toBeGreaterThan(0);
    expect(create).not.toHaveBeenCalled();
  });

  it('3. missing X-Admin-Key header → 401 Unauthorized', async () => {
    const create = vi.fn();
    const app = makeApp({ propertyLockCreate: create });

    const res = await request(app)
      .post(`/admin/tenants/${TENANT}/property-locks`)
      .send(VALID_CREATE_BODY);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Unauthorized' });
    expect(create).not.toHaveBeenCalled();
  });

  it('4. invalid tenant UUID in path → 400 INVALID_ID', async () => {
    const create = vi.fn();
    const app = makeApp({ propertyLockCreate: create });

    const res = await request(app)
      .post('/admin/tenants/not-a-uuid/property-locks')
      .set('X-Admin-Key', ADMIN_KEY)
      .send(VALID_CREATE_BODY);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ID');
    expect(create).not.toHaveBeenCalled();
  });
});

describe('GET /admin/tenants/:tenantId/property-locks', () => {
  beforeEach(() => vi.clearAllMocks());

  it('5. lists all mappings for a tenant → 200 with propertyLocks array, where includes tenant_id', async () => {
    const findMany = vi.fn().mockResolvedValue([makeLock()]);
    const app = makeApp({ propertyLockFindMany: findMany });

    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/property-locks`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.propertyLocks)).toBe(true);
    expect(res.body.propertyLocks).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: TENANT }),
      }),
    );
  });

  it('6. GET with ?property_id= filter → 200, findMany called with property_external_id filter and tenant_id', async () => {
    const findMany = vi.fn().mockResolvedValue([makeLock()]);
    const app = makeApp({ propertyLockFindMany: findMany });

    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/property-locks?property_id=prop-ext-001`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant_id: TENANT,
          property_external_id: 'prop-ext-001',
        }),
      }),
    );
  });

  it('7. returns 200 with empty array when no mappings exist', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const app = makeApp({ propertyLockFindMany: findMany });

    const res = await request(app)
      .get(`/admin/tenants/${OTHER_TENANT}/property-locks`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.propertyLocks).toHaveLength(0);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: OTHER_TENANT }),
      }),
    );
  });
});

describe('GET /admin/tenants/:tenantId/property-locks/:lockId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('8. GET single existing mapping → 200 with lock object, findFirst scoped by tenant_id', async () => {
    const findFirst = vi.fn().mockResolvedValue(makeLock());
    const app = makeApp({ propertyLockFindFirst: findFirst });

    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/property-locks/${LOCK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(LOCK_ID);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: LOCK_ID, tenant_id: TENANT }),
      }),
    );
  });

  it('9. GET non-existent mapping → 404 NOT_FOUND', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ propertyLockFindFirst: findFirst });

    const res = await request(app)
      .get(`/admin/tenants/${TENANT}/property-locks/${LOCK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
  });

  it('10. cross-tenant isolation: GET with wrong tenant_id → 404 (findFirst returns null for that tenant)', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ propertyLockFindFirst: findFirst });

    const res = await request(app)
      .get(`/admin/tenants/${OTHER_TENANT}/property-locks/${LOCK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: LOCK_ID, tenant_id: OTHER_TENANT }),
      }),
    );
  });
});

describe('PATCH /admin/tenants/:tenantId/property-locks/:lockId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('11. PATCH existing mapping → 200 with updated object, both findFirst and update called', async () => {
    const findFirst = vi.fn().mockResolvedValue(makeLock());
    const update = vi.fn().mockResolvedValue(makeLock({ lock_name: 'Back Door' }));
    const app = makeApp({ propertyLockFindFirst: findFirst, propertyLockUpdate: update });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT}/property-locks/${LOCK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ lock_name: 'Back Door' });

    expect(res.status).toBe(200);
    expect(res.body.lock_name).toBe('Back Door');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: LOCK_ID, tenant_id: TENANT }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: LOCK_ID }) }),
    );
  });

  it('12. PATCH non-existent mapping → 404 NOT_FOUND', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const update = vi.fn();
    const app = makeApp({ propertyLockFindFirst: findFirst, propertyLockUpdate: update });

    const res = await request(app)
      .patch(`/admin/tenants/${TENANT}/property-locks/${LOCK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY)
      .send({ lock_name: 'Back Door' });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('DELETE /admin/tenants/:tenantId/property-locks/:lockId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('13. DELETE existing mapping → 204 empty body, findFirst scoped by tenant_id', async () => {
    const findFirst = vi.fn().mockResolvedValue(makeLock());
    const del = vi.fn().mockResolvedValue(makeLock());
    const app = makeApp({ propertyLockFindFirst: findFirst, propertyLockDelete: del });

    const res = await request(app)
      .delete(`/admin/tenants/${TENANT}/property-locks/${LOCK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: LOCK_ID, tenant_id: TENANT }),
      }),
    );
    expect(del).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: LOCK_ID }) }),
    );
  });

  it('14. DELETE non-existent mapping → 404 NOT_FOUND', async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const del = vi.fn();
    const app = makeApp({ propertyLockFindFirst: findFirst, propertyLockDelete: del });

    const res = await request(app)
      .delete(`/admin/tenants/${TENANT}/property-locks/${LOCK_ID}`)
      .set('X-Admin-Key', ADMIN_KEY);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'NOT_FOUND' });
    expect(del).not.toHaveBeenCalled();
  });
});
