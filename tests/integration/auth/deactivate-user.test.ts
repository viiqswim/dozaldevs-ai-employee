import { describe, it, expect, vi, afterEach, afterAll, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { getPrisma, disconnectPrisma } from '../../setup.js';

vi.mock('../../../src/lib/auth/verify-jwt.js', () => ({
  verifySupabaseJwt: vi.fn(),
}));

const { verifySupabaseJwt } = await import('../../../src/lib/auth/verify-jwt.js');
const { authMiddleware } = await import('../../../src/gateway/middleware/auth.js');

const TEST_SUPABASE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const TEST_EMAIL = 'deactivate-enforcement-test@example.com';

function makeTestClaims() {
  return {
    sub: TEST_SUPABASE_ID,
    email: TEST_EMAIL,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  };
}

function makeReqRes() {
  const statusMock = vi.fn().mockReturnThis();
  const jsonMock = vi.fn();
  const req = {
    headers: { authorization: 'Bearer fake-jwt-token' },
  } as unknown as Request;
  const res = { status: statusMock, json: jsonMock } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next, statusMock, jsonMock };
}

beforeEach(async () => {
  const prisma = getPrisma();
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  vi.mocked(verifySupabaseJwt).mockResolvedValue(makeTestClaims());
});

afterEach(async () => {
  const prisma = getPrisma();
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  vi.clearAllMocks();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('deactivation enforcement', () => {
  it('blocks a disabled user immediately — same JWT returns 403 after status change in DB', async () => {
    const prisma = getPrisma();

    await prisma.user.create({
      data: {
        supabase_id: TEST_SUPABASE_ID,
        email: TEST_EMAIL,
        status: 'active',
        role: 'USER',
      },
    });

    const { req: req1, res: res1, next: next1 } = makeReqRes();
    await authMiddleware(req1, res1, next1);
    expect(next1).toHaveBeenCalledOnce();

    await prisma.user.update({
      where: { email: TEST_EMAIL },
      data: { status: 'disabled' },
    });

    const { req: req2, res: res2, next: next2, statusMock, jsonMock } = makeReqRes();
    await authMiddleware(req2, res2, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ error: 'ACCOUNT_DISABLED' }));
  });

  it('returns 401 for a soft-deleted user (deleted_at is set)', async () => {
    const prisma = getPrisma();

    await prisma.user.create({
      data: {
        supabase_id: TEST_SUPABASE_ID,
        email: TEST_EMAIL,
        status: 'active',
        role: 'USER',
        deleted_at: new Date(),
      },
    });

    const { req, res, next, statusMock } = makeReqRes();
    await authMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
  });
});
