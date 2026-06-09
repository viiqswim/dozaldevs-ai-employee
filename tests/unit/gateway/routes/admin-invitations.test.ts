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

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { adminInvitationsRoutes } =
  await import('../../../../src/gateway/routes/admin-invitations.js');

const TENANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const INVITATION_ID = 'dddddddd-dddd-4ddd-dddd-dddddddddddd';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: USER_ID,
    supabaseId: 'sup-abc',
    email: 'admin@example.com',
    name: 'Admin User',
    globalRole: Role.USER,
    status: 'active',
    ...overrides,
  };
}

type PrismaOverrides = {
  invitationFindFirst?: ReturnType<typeof vi.fn>;
  invitationCreate?: ReturnType<typeof vi.fn>;
  invitationUpdate?: ReturnType<typeof vi.fn>;
  userFindFirst?: ReturnType<typeof vi.fn>;
  membershipFindFirst?: ReturnType<typeof vi.fn>;
  membershipCreate?: ReturnType<typeof vi.fn>;
  transaction?: ReturnType<typeof vi.fn>;
};

function makeApp(overrides: PrismaOverrides = {}) {
  const app = express();
  app.use(express.json());

  const defaultInvitationFindFirst = vi.fn().mockResolvedValue(null);
  const defaultInvitationCreate = vi.fn().mockResolvedValue({
    id: INVITATION_ID,
    email: 'new@example.com',
    role: TenantRole.MEMBER,
    status: 'pending',
    expires_at: new Date('2026-06-16T00:00:00Z'),
  });
  const defaultInvitationUpdate = vi.fn().mockResolvedValue({});
  const defaultUserFindFirst = vi.fn().mockResolvedValue(null);
  const defaultMembershipFindFirst = vi.fn().mockResolvedValue(null);
  const defaultMembershipCreate = vi.fn().mockResolvedValue({});

  const invFindFirst = overrides.invitationFindFirst ?? defaultInvitationFindFirst;
  const invUpdate = overrides.invitationUpdate ?? defaultInvitationUpdate;
  const userFind = overrides.userFindFirst ?? defaultUserFindFirst;
  const memFind = overrides.membershipFindFirst ?? defaultMembershipFindFirst;
  const memCreate = overrides.membershipCreate ?? defaultMembershipCreate;

  const defaultTransaction = vi
    .fn()
    .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        tenantInvitation: { findFirst: invFindFirst, update: invUpdate },
        user: { findFirst: userFind },
        tenantMembership: { findFirst: memFind, create: memCreate },
      };
      return fn(tx);
    });

  app.use(
    adminInvitationsRoutes({
      prisma: {
        tenantInvitation: {
          findFirst: invFindFirst,
          create: overrides.invitationCreate ?? defaultInvitationCreate,
          update: invUpdate,
        },
        user: { findFirst: userFind },
        tenantMembership: { findFirst: memFind },
        $transaction: overrides.transaction ?? defaultTransaction,
      } as never,
    }),
  );
  return app;
}

describe('POST /admin/tenants/:tenantId/invitations', () => {
  beforeEach(() => {
    currentAuth = {};
    tenantMembershipForAuthz = null;
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
  });

  it('creates invitation and returns 201 for valid email and role', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const invitationCreate = vi.fn().mockResolvedValue({
      id: INVITATION_ID,
      email: 'new@example.com',
      role: TenantRole.MEMBER,
      status: 'pending',
      expires_at: new Date('2026-06-16T00:00:00Z'),
    });
    const app = makeApp({ invitationCreate });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ email: 'new@example.com', role: 'MEMBER' });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe('new@example.com');
    expect(res.body.role).toBe('MEMBER');
    expect(res.body.status).toBe('pending');
    expect(res.body.id).toBe(INVITATION_ID);
    expect(invitationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          email: 'new@example.com',
          role: TenantRole.MEMBER,
          status: 'pending',
        }),
      }),
    );
  });

  it('returns 400 when email is missing', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ role: 'MEMBER' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_EMAIL');
  });

  it('returns 400 when role is invalid', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ email: 'new@example.com', role: 'SUPERADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ROLE');
  });

  it('returns 400 when role is missing', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ email: 'new@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_ROLE');
  });

  it('returns 409 when user is already a member', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const userFindFirst = vi.fn().mockResolvedValue({ id: USER_ID, email: 'existing@example.com' });
    const membershipFindFirst = vi.fn().mockResolvedValue({
      tenant_id: TENANT_ID,
      user_id: USER_ID,
    });
    const app = makeApp({ userFindFirst, membershipFindFirst });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ email: 'existing@example.com', role: 'MEMBER' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_MEMBER');
  });

  it('sends invite even when user exists but is not a member', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const userFindFirst = vi.fn().mockResolvedValue({ id: USER_ID, email: 'existing@example.com' });
    const membershipFindFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ userFindFirst, membershipFindFirst });
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ email: 'existing@example.com', role: 'MEMBER' });
    expect(res.status).toBe(201);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('skips error on Supabase 422 (user already exists in auth)', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    mockFetch.mockResolvedValue({ ok: false, status: 422, text: vi.fn().mockResolvedValue('') });
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ email: 'new@example.com', role: 'MEMBER' });
    expect(res.status).toBe(201);
  });

  it('returns 500 when Supabase invite fails with non-422 error', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal server error'),
    });
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ email: 'new@example.com', role: 'MEMBER' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('INVITE_FAILED');
  });

  it('returns 403 for MEMBER role', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.MEMBER };
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ email: 'new@example.com', role: 'MEMBER' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 401 when unauthenticated', async () => {
    currentAuth = {};
    const app = makeApp();
    const res = await request(app)
      .post(`/admin/tenants/${TENANT_ID}/invitations`)
      .send({ email: 'new@example.com', role: 'MEMBER' });
    expect(res.status).toBe(401);
  });
});

describe('POST /invitations/accept', () => {
  const TOKEN = 'a'.repeat(64);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a valid pending invitation and creates membership', async () => {
    const pendingInvitation = {
      id: INVITATION_ID,
      tenant_id: TENANT_ID,
      email: 'new@example.com',
      role: TenantRole.MEMBER,
      status: 'pending',
      expires_at: new Date(Date.now() + 86400000),
    };
    const userRecord = { id: USER_ID, email: 'new@example.com' };
    const invitationFindFirst = vi.fn().mockResolvedValue(pendingInvitation);
    const userFindFirst = vi.fn().mockResolvedValue(userRecord);
    const membershipFindFirst = vi.fn().mockResolvedValue(null);
    const membershipCreate = vi.fn().mockResolvedValue({});
    const invitationUpdate = vi.fn().mockResolvedValue({});

    const transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          tenantInvitation: { findFirst: invitationFindFirst, update: invitationUpdate },
          user: { findFirst: userFindFirst },
          tenantMembership: { findFirst: membershipFindFirst, create: membershipCreate },
        };
        return fn(tx);
      });

    const app = makeApp({ transaction });
    const res = await request(app).post('/invitations/accept').send({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Invitation accepted');
    expect(membershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          role: TenantRole.MEMBER,
        }),
      }),
    );
    expect(invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'accepted' }),
      }),
    );
  });

  it('returns 400 when token is missing', async () => {
    const app = makeApp();
    const res = await request(app).post('/invitations/accept').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_TOKEN');
  });

  it('returns 404 when invitation not found', async () => {
    const transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          tenantInvitation: { findFirst: vi.fn().mockResolvedValue(null), update: vi.fn() },
          user: { findFirst: vi.fn() },
          tenantMembership: { findFirst: vi.fn(), create: vi.fn() },
        };
        return fn(tx);
      });
    const app = makeApp({ transaction });
    const res = await request(app).post('/invitations/accept').send({ token: TOKEN });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 410 for already-accepted invitation', async () => {
    const transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          tenantInvitation: {
            findFirst: vi.fn().mockResolvedValue({
              id: INVITATION_ID,
              status: 'accepted',
              expires_at: new Date(Date.now() + 86400000),
            }),
            update: vi.fn(),
          },
          user: { findFirst: vi.fn() },
          tenantMembership: { findFirst: vi.fn(), create: vi.fn() },
        };
        return fn(tx);
      });
    const app = makeApp({ transaction });
    const res = await request(app).post('/invitations/accept').send({ token: TOKEN });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('ALREADY_USED');
  });

  it('returns 410 for revoked invitation', async () => {
    const transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          tenantInvitation: {
            findFirst: vi.fn().mockResolvedValue({
              id: INVITATION_ID,
              status: 'revoked',
              expires_at: new Date(Date.now() + 86400000),
            }),
            update: vi.fn(),
          },
          user: { findFirst: vi.fn() },
          tenantMembership: { findFirst: vi.fn(), create: vi.fn() },
        };
        return fn(tx);
      });
    const app = makeApp({ transaction });
    const res = await request(app).post('/invitations/accept').send({ token: TOKEN });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('ALREADY_USED');
  });

  it('returns 410 for expired invitation', async () => {
    const transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          tenantInvitation: {
            findFirst: vi.fn().mockResolvedValue({
              id: INVITATION_ID,
              status: 'pending',
              expires_at: new Date(Date.now() - 86400000),
            }),
            update: vi.fn(),
          },
          user: { findFirst: vi.fn() },
          tenantMembership: { findFirst: vi.fn(), create: vi.fn() },
        };
        return fn(tx);
      });
    const app = makeApp({ transaction });
    const res = await request(app).post('/invitations/accept').send({ token: TOKEN });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('EXPIRED');
  });

  it('returns 404 when user record not found after clicking magic link', async () => {
    const transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          tenantInvitation: {
            findFirst: vi.fn().mockResolvedValue({
              id: INVITATION_ID,
              tenant_id: TENANT_ID,
              email: 'new@example.com',
              role: TenantRole.MEMBER,
              status: 'pending',
              expires_at: new Date(Date.now() + 86400000),
            }),
            update: vi.fn(),
          },
          user: { findFirst: vi.fn().mockResolvedValue(null) },
          tenantMembership: { findFirst: vi.fn(), create: vi.fn() },
        };
        return fn(tx);
      });
    const app = makeApp({ transaction });
    const res = await request(app).post('/invitations/accept').send({ token: TOKEN });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('USER_NOT_FOUND');
  });

  it('returns 409 when user is already a member', async () => {
    const transaction = vi
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          tenantInvitation: {
            findFirst: vi.fn().mockResolvedValue({
              id: INVITATION_ID,
              tenant_id: TENANT_ID,
              email: 'new@example.com',
              role: TenantRole.MEMBER,
              status: 'pending',
              expires_at: new Date(Date.now() + 86400000),
            }),
            update: vi.fn(),
          },
          user: { findFirst: vi.fn().mockResolvedValue({ id: USER_ID }) },
          tenantMembership: {
            findFirst: vi.fn().mockResolvedValue({ tenant_id: TENANT_ID, user_id: USER_ID }),
            create: vi.fn(),
          },
        };
        return fn(tx);
      });
    const app = makeApp({ transaction });
    const res = await request(app).post('/invitations/accept').send({ token: TOKEN });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_MEMBER');
  });
});

describe('POST /invitations/decline', () => {
  const TOKEN = 'b'.repeat(64);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('declines a pending invitation and returns 200', async () => {
    const invitationFindFirst = vi.fn().mockResolvedValue({ id: INVITATION_ID, status: 'pending' });
    const invitationUpdate = vi.fn().mockResolvedValue({});
    const app = makeApp({ invitationFindFirst, invitationUpdate });
    const res = await request(app).post('/invitations/decline').send({ token: TOKEN });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Invitation declined');
    expect(invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'declined' }),
      }),
    );
  });

  it('returns 400 when token is missing', async () => {
    const app = makeApp();
    const res = await request(app).post('/invitations/decline').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_TOKEN');
  });

  it('returns 404 when invitation not found', async () => {
    const invitationFindFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ invitationFindFirst });
    const res = await request(app).post('/invitations/decline').send({ token: TOKEN });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 410 when invitation is already accepted', async () => {
    const invitationFindFirst = vi
      .fn()
      .mockResolvedValue({ id: INVITATION_ID, status: 'accepted' });
    const app = makeApp({ invitationFindFirst });
    const res = await request(app).post('/invitations/decline').send({ token: TOKEN });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('ALREADY_USED');
  });

  it('returns 410 when invitation is already declined', async () => {
    const invitationFindFirst = vi
      .fn()
      .mockResolvedValue({ id: INVITATION_ID, status: 'declined' });
    const app = makeApp({ invitationFindFirst });
    const res = await request(app).post('/invitations/decline').send({ token: TOKEN });
    expect(res.status).toBe(410);
    expect(res.body.error).toBe('ALREADY_USED');
  });
});

describe('POST /admin/tenants/:tenantId/invitations/:invitationId/revoke', () => {
  beforeEach(() => {
    currentAuth = {};
    tenantMembershipForAuthz = null;
    vi.clearAllMocks();
  });

  it('revokes a pending invitation and returns 200', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const invitationFindFirst = vi.fn().mockResolvedValue({ id: INVITATION_ID, status: 'pending' });
    const invitationUpdate = vi.fn().mockResolvedValue({});
    const app = makeApp({ invitationFindFirst, invitationUpdate });
    const res = await request(app).post(
      `/admin/tenants/${TENANT_ID}/invitations/${INVITATION_ID}/revoke`,
    );
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Invitation revoked');
    expect(invitationUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'revoked' }),
      }),
    );
  });

  it('returns 409 when invitation is already accepted', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const invitationFindFirst = vi
      .fn()
      .mockResolvedValue({ id: INVITATION_ID, status: 'accepted' });
    const app = makeApp({ invitationFindFirst });
    const res = await request(app).post(
      `/admin/tenants/${TENANT_ID}/invitations/${INVITATION_ID}/revoke`,
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NOT_PENDING');
  });

  it('returns 409 when invitation is already revoked', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const invitationFindFirst = vi.fn().mockResolvedValue({ id: INVITATION_ID, status: 'revoked' });
    const app = makeApp({ invitationFindFirst });
    const res = await request(app).post(
      `/admin/tenants/${TENANT_ID}/invitations/${INVITATION_ID}/revoke`,
    );
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NOT_PENDING');
  });

  it('returns 404 when invitation not found', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.ADMIN };
    const invitationFindFirst = vi.fn().mockResolvedValue(null);
    const app = makeApp({ invitationFindFirst });
    const res = await request(app).post(
      `/admin/tenants/${TENANT_ID}/invitations/${INVITATION_ID}/revoke`,
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  it('returns 403 for MEMBER role', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.MEMBER };
    const app = makeApp();
    const res = await request(app).post(
      `/admin/tenants/${TENANT_ID}/invitations/${INVITATION_ID}/revoke`,
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('FORBIDDEN');
  });

  it('returns 401 when unauthenticated', async () => {
    currentAuth = {};
    const app = makeApp();
    const res = await request(app).post(
      `/admin/tenants/${TENANT_ID}/invitations/${INVITATION_ID}/revoke`,
    );
    expect(res.status).toBe(401);
  });

  it('allows OWNER to revoke', async () => {
    currentAuth = { auth: makeUser() };
    tenantMembershipForAuthz = { role: TenantRole.OWNER };
    const invitationFindFirst = vi.fn().mockResolvedValue({ id: INVITATION_ID, status: 'pending' });
    const invitationUpdate = vi.fn().mockResolvedValue({});
    const app = makeApp({ invitationFindFirst, invitationUpdate });
    const res = await request(app).post(
      `/admin/tenants/${TENANT_ID}/invitations/${INVITATION_ID}/revoke`,
    );
    expect(res.status).toBe(200);
  });
});
