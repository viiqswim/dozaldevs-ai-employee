import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getPrisma, disconnectPrisma } from '../../setup.js';
import { adminInvitationsRoutes } from '../../../src/gateway/routes/admin-invitations.js';

vi.mock('../../../src/lib/auth/verify-jwt.js', () => ({
  verifySupabaseJwt: vi.fn(),
}));

const { verifySupabaseJwt } = await import('../../../src/lib/auth/verify-jwt.js');

const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const INVITEE_SUPABASE_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const INVITEE_EMAIL = `accept-test-${Date.now()}@vlrealestate.co`;
const MISMATCH_SUPABASE_ID = 'cccccccc-cccc-4ccc-cccc-cccccccccccc';

function makeApp() {
  process.env.SERVICE_TOKEN = 'test-service-token';
  process.env.ENCRYPTION_KEY = '0000000000000000000000000000000000000000000000000000000000000001';
  const app = express();
  app.use(express.json());
  app.use(adminInvitationsRoutes({ prisma: getPrisma() as never }));
  return app;
}

function makeInviteeClaims(overrides: Record<string, unknown> = {}) {
  return {
    sub: INVITEE_SUPABASE_ID,
    email: INVITEE_EMAIL,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

async function createPendingInvitation(
  overrides: {
    email?: string;
    status?: string;
    expires_at?: Date;
  } = {},
) {
  const prisma = getPrisma();
  const token = `test-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return prisma.tenantInvitation.create({
    data: {
      tenant_id: TENANT_ID,
      email: overrides.email ?? INVITEE_EMAIL,
      role: 'MEMBER',
      token,
      status: overrides.status ?? 'pending',
      expires_at: overrides.expires_at ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

async function createInviteeUser() {
  return getPrisma().user.create({
    data: {
      supabase_id: INVITEE_SUPABASE_ID,
      email: INVITEE_EMAIL,
      role: 'USER',
      status: 'active',
    },
  });
}

async function cleanupInviteeData() {
  const prisma = getPrisma();
  await prisma.$executeRaw`
    DELETE FROM tenant_memberships
    WHERE user_id IN (SELECT id FROM users WHERE email = ${INVITEE_EMAIL})
       OR user_id IN (SELECT id FROM users WHERE supabase_id = ${INVITEE_SUPABASE_ID}::uuid)
       OR user_id IN (SELECT id FROM users WHERE supabase_id = ${MISMATCH_SUPABASE_ID}::uuid)
  `;
  await prisma.tenantInvitation.deleteMany({ where: { email: INVITEE_EMAIL } });
  await prisma.user.deleteMany({ where: { email: INVITEE_EMAIL } });
  await prisma.user.deleteMany({ where: { supabase_id: INVITEE_SUPABASE_ID } });
  await prisma.user.deleteMany({ where: { supabase_id: MISMATCH_SUPABASE_ID } });
}

describe('POST /invitations/accept — authenticated contract (RED)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await cleanupInviteeData();
  });

  afterEach(async () => {
    await cleanupInviteeData();
  });

  afterAll(async () => {
    await disconnectPrisma();
  });

  it('rejects unauthenticated request with 401', async () => {
    const invitation = await createPendingInvitation();
    const app = makeApp();

    const res = await request(app).post('/invitations/accept').send({ token: invitation.token });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/AUTHENTICATION_REQUIRED|INVALID_TOKEN/);
  });

  it('does not create a user row on accept — user must already exist via authMiddleware', async () => {
    const prisma = getPrisma();
    const user = await createInviteeUser();
    const invitation = await createPendingInvitation();
    const app = makeApp();

    const usersBefore = await prisma.user.count({ where: { email: INVITEE_EMAIL } });
    expect(usersBefore).toBe(1);

    vi.mocked(verifySupabaseJwt).mockResolvedValue(makeInviteeClaims());

    const res = await request(app)
      .post('/invitations/accept')
      .set('Authorization', 'Bearer fake-jwt-token')
      .send({ token: invitation.token });

    expect(res.status).toBe(200);

    const usersAfter = await prisma.user.count({ where: { email: INVITEE_EMAIL } });
    expect(usersAfter).toBe(1);

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenant_id: TENANT_ID, user_id: user.id, deleted_at: null },
    });
    expect(membership).not.toBeNull();
  });

  it('returns 200 on idempotent re-accept when membership is already active', async () => {
    const prisma = getPrisma();
    const user = await createInviteeUser();

    await prisma.tenantMembership.create({
      data: { tenant_id: TENANT_ID, user_id: user.id, role: 'MEMBER' },
    });

    const invitation = await createPendingInvitation();
    const app = makeApp();

    vi.mocked(verifySupabaseJwt).mockResolvedValue(makeInviteeClaims());

    const res = await request(app)
      .post('/invitations/accept')
      .set('Authorization', 'Bearer fake-jwt-token')
      .send({ token: invitation.token });

    expect(res.status).toBe(200);
  });

  it('restores a soft-deleted membership and returns 200', async () => {
    const prisma = getPrisma();
    const user = await createInviteeUser();

    await prisma.tenantMembership.create({
      data: {
        tenant_id: TENANT_ID,
        user_id: user.id,
        role: 'MEMBER',
        deleted_at: new Date(),
      },
    });

    const invitation = await createPendingInvitation();
    const app = makeApp();

    vi.mocked(verifySupabaseJwt).mockResolvedValue(makeInviteeClaims());

    const res = await request(app)
      .post('/invitations/accept')
      .set('Authorization', 'Bearer fake-jwt-token')
      .send({ token: invitation.token });

    expect(res.status).toBe(200);

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenant_id: TENANT_ID, user_id: user.id },
    });
    expect(membership).not.toBeNull();
    expect(membership!.deleted_at).toBeNull();
  });

  it('returns 403 when authenticated user email does not match invitation email', async () => {
    const prisma = getPrisma();
    const mismatchEmail = `mismatch-${Date.now()}@vlrealestate.co`;

    await prisma.user.upsert({
      where: { supabase_id: MISMATCH_SUPABASE_ID },
      create: {
        supabase_id: MISMATCH_SUPABASE_ID,
        email: mismatchEmail,
        role: 'USER',
        status: 'active',
      },
      update: { email: mismatchEmail, deleted_at: null },
    });

    const invitation = await createPendingInvitation({ email: INVITEE_EMAIL });
    const app = makeApp();

    vi.mocked(verifySupabaseJwt).mockResolvedValue(
      makeInviteeClaims({ sub: MISMATCH_SUPABASE_ID, email: mismatchEmail }),
    );

    const res = await request(app)
      .post('/invitations/accept')
      .set('Authorization', 'Bearer fake-jwt-token')
      .send({ token: invitation.token });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/EMAIL_MISMATCH|FORBIDDEN/);
  });

  it('returns 410 for an expired invitation', async () => {
    const invitation = await createPendingInvitation({
      expires_at: new Date(Date.now() - 1000),
    });
    const app = makeApp();

    vi.mocked(verifySupabaseJwt).mockResolvedValue(makeInviteeClaims());

    const res = await request(app)
      .post('/invitations/accept')
      .set('Authorization', 'Bearer fake-jwt-token')
      .send({ token: invitation.token });

    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/EXPIRED/);
  });

  it('returns 410 for an already-used invitation', async () => {
    const invitation = await createPendingInvitation({ status: 'accepted' });
    const app = makeApp();

    vi.mocked(verifySupabaseJwt).mockResolvedValue(makeInviteeClaims());

    const res = await request(app)
      .post('/invitations/accept')
      .set('Authorization', 'Bearer fake-jwt-token')
      .send({ token: invitation.token });

    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/ALREADY_USED/);
  });
});
