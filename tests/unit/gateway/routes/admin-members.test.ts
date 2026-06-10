import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { TenantRole, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../../../src/lib/auth/types.js';

let currentAuth: { auth?: AuthenticatedUser; isServiceToken?: boolean } = {};
let tenantMembershipForAuthz: { role: TenantRole } | null = null;

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

vi.mock('../../../../src/gateway/middleware/authz.js', () => ({
  requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction): void => {
    if (req.isServiceToken || req.auth) {
      next();
      return;
    }
    res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
  },
  requireTenantRole:
    (...roles: TenantRole[]) =>
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ): Promise<void> => {
      if (!req.auth) {
        res.status(401).json({ error: 'AUTHENTICATION_REQUIRED' });
        return;
      }
      if (!tenantMembershipForAuthz) {
        res.status(403).json({ error: 'FORBIDDEN' });
        return;
      }
      const RANK: Record<TenantRole, number> = {
        [TenantRole.OWNER]: 4,
        [TenantRole.ADMIN]: 3,
        [TenantRole.MEMBER]: 2,
        [TenantRole.VIEWER]: 1,
      };
      const minRequired = Math.min(...roles.map((r) => RANK[r]));
      if (RANK[tenantMembershipForAuthz.role] < minRequired) {
        res.status(403).json({ error: 'FORBIDDEN' });
        return;
      }
      req.tenantContext = {
        tenantId: req.params['tenantId'] as string,
        tenantRole: tenantMembershipForAuthz.role,
      };
      next();
    },
}));

const { adminMembersRoutes } = await import('../../../../src/gateway/routes/admin-members.js');

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const USER_A = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const USER_B = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: USER_A,
    supabaseId: 'sup-abc',
    email: 'admin@example.com',
    name: 'Admin User',
    globalRole: Role.USER,
    status: 'active',
    ...overrides,
  };
}

type PrismaOverrides = {
  count?: ReturnType<typeof vi.fn>;
  findFirst?: ReturnType<typeof vi.fn>;
  findMany?: ReturnType<typeof vi.fn>;
  updateMany?: ReturnType<typeof vi.fn>;
};

function makeApp(overrides: PrismaOverrides = {}) {
  const app = express();
  app.use(express.json());
  app.use(
    adminMembersRoutes({
      prisma: {
        tenantMembership: {
          count: overrides.count ?? vi.fn().mockResolvedValue(0),
          findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue(null),
          findMany: overrides.findMany ?? vi.fn().mockResolvedValue([]),
          updateMany: overrides.updateMany ?? vi.fn().mockResolvedValue({ count: 0 }),
        },
      } as never,
    }),
  );
  return app;
}

describe('GET /admin/tenants/:tenantId/members', () => {
  beforeEach(() => {
    currentAuth = {};
    tenantMembershipForAuthz = null;
    vi.clearAllMocks();
  });

  it('returns active member list for an ADMIN', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const joinedAt = new Date('2024-01-01T00:00:00Z');
    const findMany = vi.fn().mockResolvedValue([
      {
        user_id: USER_B,
        role: TenantRole.MEMBER,
        joined_at: joinedAt,
        user: { email: 'bob@example.com', name: 'Bob' },
      },
    ]);
    const app = makeApp({ findMany });
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/members`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      {
        userId: USER_B,
        email: 'bob@example.com',
        name: 'Bob',
        tenantRole: 'MEMBER',
        joinedAt: joinedAt.toISOString(),
      },
    ]);
  });

  it('MEMBER can list members (allowed by VIEWER-minimum gate)', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.MEMBER };
    const app = makeApp();
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/members`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns 401 when unauthenticated', async () => {
    currentAuth = {};
    const app = makeApp();
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/members`);
    expect(res.status).toBe(401);
  });

  it('returns 500 when prisma throws', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const findMany = vi.fn().mockRejectedValue(new Error('DB error'));
    const app = makeApp({ findMany });
    const res = await request(app).get(`/admin/tenants/${TENANT_ID}/members`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});

describe('PATCH /admin/tenants/:tenantId/members/:userId', () => {
  beforeEach(() => {
    currentAuth = {};
    tenantMembershipForAuthz = null;
    vi.clearAllMocks();
  });

  it('successfully changes a MEMBER role to ADMIN', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const count = vi.fn().mockResolvedValue(2);
    const findFirst = vi.fn().mockResolvedValue({ role: TenantRole.MEMBER });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const app = makeApp({ count, findFirst, updateMany });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/members/${USER_B}`)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: USER_B, tenantRole: 'ADMIN' });
  });

  it('returns 400 for an invalid role value', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const app = makeApp();
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/members/${USER_B}`)
      .send({ role: 'SUPERADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ROLE');
  });

  it('returns 400 when role is missing', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const app = makeApp();
    const res = await request(app).patch(`/admin/tenants/${TENANT_ID}/members/${USER_B}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ROLE');
  });

  it('returns 409 when demoting the last owner', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const count = vi.fn().mockResolvedValue(1);
    const findFirst = vi.fn().mockResolvedValue({ role: TenantRole.OWNER });
    const app = makeApp({ count, findFirst });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/members/${USER_B}`)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('LAST_OWNER');
  });

  it('returns 404 when member does not exist', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const count = vi.fn().mockResolvedValue(2);
    const findFirst = vi.fn().mockResolvedValue({ role: TenantRole.MEMBER });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const app = makeApp({ count, findFirst, updateMany });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/members/${USER_B}`)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 403 for a MEMBER role', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.MEMBER };
    const app = makeApp();
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/members/${USER_B}`)
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  it('allows owner role change to OWNER (same role, not last-owner issue)', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const count = vi.fn().mockResolvedValue(1);
    const findFirst = vi.fn().mockResolvedValue({ role: TenantRole.OWNER });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const app = makeApp({ count, findFirst, updateMany });
    const res = await request(app)
      .patch(`/admin/tenants/${TENANT_ID}/members/${USER_B}`)
      .send({ role: 'OWNER' });
    expect(res.status).toBe(200);
    expect(res.body.tenantRole).toBe('OWNER');
  });
});

describe('DELETE /admin/tenants/:tenantId/members/:userId', () => {
  beforeEach(() => {
    currentAuth = {};
    tenantMembershipForAuthz = null;
    vi.clearAllMocks();
  });

  it('soft-removes a member successfully', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const count = vi.fn().mockResolvedValue(2);
    const findFirst = vi.fn().mockResolvedValue({ role: TenantRole.MEMBER });
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const app = makeApp({ count, findFirst, updateMany });
    const res = await request(app).delete(`/admin/tenants/${TENANT_ID}/members/${USER_B}`);
    expect(res.status).toBe(204);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenant_id: TENANT_ID, user_id: USER_B, deleted_at: null }),
        data: expect.objectContaining({ deleted_at: expect.any(Date) }),
      }),
    );
  });

  it('returns 409 when removing the last owner', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const count = vi.fn().mockResolvedValue(1);
    const findFirst = vi.fn().mockResolvedValue({ role: TenantRole.OWNER });
    const app = makeApp({ count, findFirst });
    const res = await request(app).delete(`/admin/tenants/${TENANT_ID}/members/${USER_B}`);
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('LAST_OWNER');
  });

  it('returns 404 when member does not exist', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const count = vi.fn().mockResolvedValue(2);
    const findFirst = vi.fn().mockResolvedValue({ role: TenantRole.MEMBER });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const app = makeApp({ count, findFirst, updateMany });
    const res = await request(app).delete(`/admin/tenants/${TENANT_ID}/members/${USER_B}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 403 for a VIEWER role', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.VIEWER };
    const app = makeApp();
    const res = await request(app).delete(`/admin/tenants/${TENANT_ID}/members/${USER_B}`);
    expect(res.status).toBe(403);
  });

  it('returns 401 when unauthenticated', async () => {
    currentAuth = {};
    const app = makeApp();
    const res = await request(app).delete(`/admin/tenants/${TENANT_ID}/members/${USER_B}`);
    expect(res.status).toBe(401);
  });
});
