import { PrismaClient, Role, TenantRole } from '@prisma/client';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { hasPermission, hasTenantPermission, type Permission } from '../../lib/auth/permissions.js';
import { sendError } from '../lib/http-response.js';

const prisma = new PrismaClient();

// Role rank — higher number means more privileged. Used to enforce minimum-role requirements.
const TENANT_ROLE_ORDER: Record<TenantRole, number> = {
  [TenantRole.OWNER]: 4,
  [TenantRole.ADMIN]: 3,
  [TenantRole.MEMBER]: 2,
  [TenantRole.VIEWER]: 1,
};

function roleAtLeast(actual: TenantRole, required: TenantRole[]): boolean {
  const minRequired = Math.min(...required.map((r) => TENANT_ROLE_ORDER[r]));
  return TENANT_ROLE_ORDER[actual] >= minRequired;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isServiceToken || req.auth) {
    next();
    return;
  }
  sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
}

export function requireTenantRole(...roles: TenantRole[]): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.isServiceToken) {
      next();
      return;
    }

    if (req.auth?.globalRole === Role.PLATFORM_OWNER) {
      const tenantId = req.params['tenantId'] as string;
      req.tenantContext = { tenantId, tenantRole: TenantRole.OWNER };
      next();
      return;
    }

    if (!req.auth) {
      sendError(res, 401, 'AUTHENTICATION_REQUIRED', 'Authentication required');
      return;
    }

    const tenantId = req.params['tenantId'] as string;
    if (!tenantId) {
      sendError(res, 400, 'MISSING_TENANT_ID', 'Tenant ID required');
      return;
    }

    const membership = await prisma.tenantMembership.findFirst({
      where: { tenant_id: tenantId, user_id: req.auth.id, deleted_at: null },
    });

    if (!membership) {
      sendError(res, 403, 'FORBIDDEN', 'Access denied');
      return;
    }

    if (!roleAtLeast(membership.role, roles)) {
      sendError(res, 403, 'FORBIDDEN', 'Insufficient role');
      return;
    }

    req.tenantContext = { tenantId, tenantRole: membership.role };
    next();
  };
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.isServiceToken) {
      next();
      return;
    }

    if (req.auth?.globalRole === Role.PLATFORM_OWNER) {
      next();
      return;
    }

    const tenantRole = req.tenantContext?.tenantRole;
    const globalRole = req.auth?.globalRole;

    const allowed = tenantRole
      ? hasTenantPermission(tenantRole, permission)
      : globalRole
        ? hasPermission(globalRole, permission)
        : false;

    if (!allowed) {
      sendError(res, 403, 'FORBIDDEN', 'Insufficient permissions');
      return;
    }

    next();
  };
}
