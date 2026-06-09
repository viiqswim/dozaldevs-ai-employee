import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../../../src/lib/auth/types.js';

let currentAuth: { auth?: AuthenticatedUser; isServiceToken?: boolean } = {};

vi.mock('../../../../src/gateway/middleware/auth.js', () => ({
  authMiddleware: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ): void => {
    if (currentAuth.auth) req.auth = currentAuth.auth;
    if (currentAuth.isServiceToken) req.isServiceToken = true;
    next();
  },
}));

const { meRoutes } = await import('../../../../src/gateway/routes/me.js');

const USER_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: USER_ID,
    supabaseId: 'sup-123',
    email: 'jane@example.com',
    name: 'Jane Doe',
    globalRole: Role.USER,
    status: 'active',
    ...overrides,
  };
}

function makeApp(prismaOverrides: { tenant?: unknown; tenantMembership?: unknown } = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    meRoutes({
      prisma: {
        tenant: { findMany: vi.fn(), ...(prismaOverrides.tenant as object) },
        tenantMembership: { findMany: vi.fn(), ...(prismaOverrides.tenantMembership as object) },
      } as never,
    }),
  );
  return app;
}

describe('GET /me', () => {
  beforeEach(() => {
    currentAuth = {};
    vi.clearAllMocks();
  });

  it('returns the authenticated user profile', async () => {
    currentAuth = { auth: makeUser() };
    const app = makeApp();
    const res = await request(app).get('/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: USER_ID,
      email: 'jane@example.com',
      name: 'Jane Doe',
      globalRole: 'USER',
      status: 'active',
    });
  });

  it('returns a synthetic service profile for a service token', async () => {
    currentAuth = { isServiceToken: true };
    const app = makeApp();
    const res = await request(app).get('/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: null,
      email: null,
      name: null,
      globalRole: 'SERVICE',
      status: 'active',
    });
  });

  it('returns 401 when unauthenticated', async () => {
    currentAuth = {};
    const app = makeApp();
    const res = await request(app).get('/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTHENTICATION_REQUIRED');
  });
});

describe('GET /me/tenants', () => {
  beforeEach(() => {
    currentAuth = {};
    vi.clearAllMocks();
  });

  it('returns only the active memberships for a regular user', async () => {
    currentAuth = { auth: makeUser() };
    const findMany = vi.fn().mockResolvedValue([
      {
        tenant_id: TENANT_A,
        role: 'ADMIN',
        tenant: { id: TENANT_A, name: 'Acme', slug: 'acme', deleted_at: null },
      },
    ]);
    const app = makeApp({ tenantMembership: { findMany } });
    const res = await request(app).get('/me/tenants');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { tenantId: TENANT_A, name: 'Acme', slug: 'acme', tenantRole: 'ADMIN' },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ user_id: USER_ID, deleted_at: null }),
      }),
    );
  });

  it('filters out memberships whose tenant is soft-deleted', async () => {
    currentAuth = { auth: makeUser() };
    const findMany = vi.fn().mockResolvedValue([
      {
        tenant_id: TENANT_A,
        role: 'MEMBER',
        tenant: { id: TENANT_A, name: 'Acme', slug: 'acme', deleted_at: null },
      },
      {
        tenant_id: TENANT_B,
        role: 'VIEWER',
        tenant: { id: TENANT_B, name: 'Gone', slug: 'gone', deleted_at: new Date() },
      },
    ]);
    const app = makeApp({ tenantMembership: { findMany } });
    const res = await request(app).get('/me/tenants');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { tenantId: TENANT_A, name: 'Acme', slug: 'acme', tenantRole: 'MEMBER' },
    ]);
  });

  it('returns all non-deleted tenants for a PLATFORM_OWNER', async () => {
    currentAuth = { auth: makeUser({ globalRole: Role.PLATFORM_OWNER }) };
    const findMany = vi.fn().mockResolvedValue([
      { id: TENANT_A, name: 'Acme', slug: 'acme' },
      { id: TENANT_B, name: 'Beta', slug: 'beta' },
    ]);
    const membershipFindMany = vi.fn();
    const app = makeApp({
      tenant: { findMany },
      tenantMembership: { findMany: membershipFindMany },
    });
    const res = await request(app).get('/me/tenants');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { tenantId: TENANT_A, name: 'Acme', slug: 'acme', tenantRole: 'OWNER' },
      { tenantId: TENANT_B, name: 'Beta', slug: 'beta', tenantRole: 'OWNER' },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deleted_at: null }) }),
    );
    expect(membershipFindMany).not.toHaveBeenCalled();
  });

  it('returns an empty list for a service token', async () => {
    currentAuth = { isServiceToken: true };
    const app = makeApp();
    const res = await request(app).get('/me/tenants');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 401 when unauthenticated', async () => {
    currentAuth = {};
    const app = makeApp();
    const res = await request(app).get('/me/tenants');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('AUTHENTICATION_REQUIRED');
  });

  it('returns 500 when prisma throws', async () => {
    currentAuth = { auth: makeUser() };
    const findMany = vi.fn().mockRejectedValue(new Error('DB connection lost'));
    const app = makeApp({ tenantMembership: { findMany } });
    const res = await request(app).get('/me/tenants');
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});
