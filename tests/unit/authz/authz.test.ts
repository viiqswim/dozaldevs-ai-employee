import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Role, TenantRole } from '@prisma/client';
import type { Request, Response, NextFunction } from 'express';

const { mockFindFirst } = vi.hoisted(() => ({ mockFindFirst: vi.fn() }));

vi.mock('@prisma/client', async () => {
  const actual = await vi.importActual<typeof import('@prisma/client')>('@prisma/client');
  return {
    ...actual,
    PrismaClient: vi.fn().mockImplementation(() => ({
      tenantMembership: {
        findFirst: mockFindFirst,
      },
    })),
  };
});

vi.mock('../../../src/gateway/lib/http-response.js', () => ({
  sendError: vi.fn(),
}));

import {
  requireAuth,
  requireTenantRole,
  requirePermission,
} from '../../../src/gateway/middleware/authz.js';
import { sendError } from '../../../src/gateway/lib/http-response.js';
import { PERMISSIONS } from '../../../src/lib/auth/permissions.js';

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    params: { tenantId: 'tenant-abc' },
    auth: undefined,
    isServiceToken: undefined,
    tenantContext: undefined,
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

function makeNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

describe('requireAuth', () => {
  it('calls next when req.auth is set', () => {
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.USER,
        status: 'active',
      },
    });
    const next = makeNext();
    requireAuth(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('calls next when req.isServiceToken is true', () => {
    const req = makeReq({ isServiceToken: true });
    const next = makeNext();
    requireAuth(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 401 when neither auth nor isServiceToken', () => {
    const req = makeReq();
    const res = makeRes();
    const next = makeNext();
    requireAuth(req, res, next);
    expect(sendError).toHaveBeenCalledWith(
      res,
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication required',
    );
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireTenantRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bypasses when isServiceToken and calls next', async () => {
    const req = makeReq({ isServiceToken: true });
    const next = makeNext();
    await requireTenantRole(TenantRole.ADMIN)(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(sendError).not.toHaveBeenCalled();
  });

  it('bypasses for PLATFORM_OWNER and attaches tenantContext with OWNER role', async () => {
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.PLATFORM_OWNER,
        status: 'active',
      },
    });
    const next = makeNext();
    await requireTenantRole(TenantRole.OWNER)(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toEqual({ tenantId: 'tenant-abc', tenantRole: TenantRole.OWNER });
  });

  it('returns 401 when unauthenticated (no auth, no serviceToken)', async () => {
    const req = makeReq();
    const res = makeRes();
    const next = makeNext();
    await requireTenantRole(TenantRole.MEMBER)(req, res, next);
    expect(sendError).toHaveBeenCalledWith(
      res,
      401,
      'AUTHENTICATION_REQUIRED',
      'Authentication required',
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when tenantId param is missing', async () => {
    const req = makeReq({
      params: {},
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.USER,
        status: 'active',
      },
    });
    const res = makeRes();
    const next = makeNext();
    await requireTenantRole(TenantRole.MEMBER)(req, res, next);
    expect(sendError).toHaveBeenCalledWith(res, 400, 'MISSING_TENANT_ID', 'Tenant ID required');
  });

  it('returns 403 FORBIDDEN when user has no membership', async () => {
    mockFindFirst.mockResolvedValue(null);
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.USER,
        status: 'active',
      },
    });
    const res = makeRes();
    const next = makeNext();
    await requireTenantRole(TenantRole.MEMBER)(req, res, next);
    expect(sendError).toHaveBeenCalledWith(res, 403, 'FORBIDDEN', 'Access denied');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when membership role is too low', async () => {
    mockFindFirst.mockResolvedValue({ role: TenantRole.VIEWER });
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.USER,
        status: 'active',
      },
    });
    const res = makeRes();
    const next = makeNext();
    await requireTenantRole(TenantRole.ADMIN)(req, res, next);
    expect(sendError).toHaveBeenCalledWith(res, 403, 'FORBIDDEN', 'Insufficient role');
    expect(next).not.toHaveBeenCalled();
  });

  it('allows MEMBER when required role is MEMBER and attaches tenantContext', async () => {
    mockFindFirst.mockResolvedValue({ role: TenantRole.MEMBER });
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.USER,
        status: 'active',
      },
    });
    const next = makeNext();
    await requireTenantRole(TenantRole.MEMBER)(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.tenantContext).toEqual({ tenantId: 'tenant-abc', tenantRole: TenantRole.MEMBER });
  });

  it('allows OWNER when required is ADMIN (OWNER rank >= ADMIN rank)', async () => {
    mockFindFirst.mockResolvedValue({ role: TenantRole.OWNER });
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.USER,
        status: 'active',
      },
    });
    const next = makeNext();
    await requireTenantRole(TenantRole.ADMIN)(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('allows ADMIN when required is MEMBER (higher rank satisfies lower requirement)', async () => {
    mockFindFirst.mockResolvedValue({ role: TenantRole.ADMIN });
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.USER,
        status: 'active',
      },
    });
    const next = makeNext();
    await requireTenantRole(TenantRole.MEMBER)(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bypasses when isServiceToken', () => {
    const req = makeReq({ isServiceToken: true });
    const next = makeNext();
    requirePermission(PERMISSIONS.MANAGE_ARCHETYPES)(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(sendError).not.toHaveBeenCalled();
  });

  it('bypasses for PLATFORM_OWNER', () => {
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.PLATFORM_OWNER,
        status: 'active',
      },
    });
    const next = makeNext();
    requirePermission(PERMISSIONS.DELETE_TENANT)(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(sendError).not.toHaveBeenCalled();
  });

  it('allows when tenantContext role has the permission', () => {
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.USER,
        status: 'active',
      },
      tenantContext: { tenantId: 'tenant-abc', tenantRole: TenantRole.ADMIN },
    });
    const next = makeNext();
    requirePermission(PERMISSIONS.MANAGE_ARCHETYPES)(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when tenantContext role lacks the permission', () => {
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.USER,
        status: 'active',
      },
      tenantContext: { tenantId: 'tenant-abc', tenantRole: TenantRole.VIEWER },
    });
    const res = makeRes();
    const next = makeNext();
    requirePermission(PERMISSIONS.MANAGE_ARCHETYPES)(req, res, next);
    expect(sendError).toHaveBeenCalledWith(res, 403, 'FORBIDDEN', 'Insufficient permissions');
    expect(next).not.toHaveBeenCalled();
  });

  it('falls back to global role when tenantContext is absent', () => {
    const req = makeReq({
      auth: {
        id: 'u1',
        supabaseId: 's1',
        email: 'a@b.com',
        name: null,
        globalRole: Role.ADMIN,
        status: 'active',
      },
    });
    const next = makeNext();
    requirePermission(PERMISSIONS.MANAGE_ARCHETYPES)(req, makeRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when no auth and no tenantContext', () => {
    const req = makeReq();
    const res = makeRes();
    const next = makeNext();
    requirePermission(PERMISSIONS.TRIGGER_EMPLOYEE)(req, res, next);
    expect(sendError).toHaveBeenCalledWith(res, 403, 'FORBIDDEN', 'Insufficient permissions');
    expect(next).not.toHaveBeenCalled();
  });
});
