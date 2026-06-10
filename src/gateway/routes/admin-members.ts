import { Router } from 'express';
import { PrismaClient, TenantRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { createLogger } from '../../lib/logger.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

const logger = createLogger('admin-members');

export interface AdminMembersRoutesOptions {
  prisma?: PrismaClient;
}

type PrismaWithMembership = {
  tenantMembership: {
    count: (args: unknown) => Promise<number>;
    findFirst: (args: unknown) => Promise<{ role: TenantRole } | null>;
    findMany: (args: unknown) => Promise<
      Array<{
        user_id: string;
        role: TenantRole;
        joined_at: Date;
        user: { email: string; name: string | null };
      }>
    >;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
};

async function assertNotLastOwner(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
  newRole?: TenantRole,
): Promise<void> {
  const db = prisma as unknown as PrismaWithMembership;

  const ownerCount = await db.tenantMembership.count({
    where: { tenant_id: tenantId, role: TenantRole.OWNER, deleted_at: null },
  });

  const membership = await db.tenantMembership.findFirst({
    where: { tenant_id: tenantId, user_id: userId, deleted_at: null },
  });

  if (!membership) return;

  const isCurrentlyOwner = membership.role === TenantRole.OWNER;
  const wouldLoseOwner =
    isCurrentlyOwner && (newRole === undefined || newRole !== TenantRole.OWNER);

  if (wouldLoseOwner && ownerCount <= 1) {
    throw new Error('LAST_OWNER');
  }
}

export function adminMembersRoutes(opts: AdminMembersRoutesOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  router.get(
    '/admin/tenants/:tenantId/members',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.VIEWER),
    async (req, res) => {
      const tenantId = req.params['tenantId'] as string;
      const db = prisma as unknown as PrismaWithMembership;
      try {
        const memberships = await db.tenantMembership.findMany({
          where: { tenant_id: tenantId, deleted_at: null },
          include: { user: { select: { id: true, email: true, name: true } } },
          orderBy: { joined_at: 'asc' },
        });
        sendSuccess(
          res,
          200,
          memberships.map((m) => ({
            userId: m.user_id,
            email: m.user.email,
            name: m.user.name,
            tenantRole: m.role,
            joinedAt: m.joined_at,
          })),
        );
      } catch (err) {
        logger.error({ err }, 'Failed to list members');
        sendError(res, 500, 'INTERNAL_ERROR', 'Failed to list members');
      }
    },
  );

  router.patch(
    '/admin/tenants/:tenantId/members/:userId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN, TenantRole.OWNER),
    async (req, res) => {
      const tenantId = req.params['tenantId'] as string;
      const userId = req.params['userId'] as string;
      const { role } = req.body as { role?: string };

      if (!role || !Object.values(TenantRole).includes(role as TenantRole)) {
        sendError(res, 400, 'INVALID_ROLE', 'Invalid role value');
        return;
      }

      const newRole = role as TenantRole;

      try {
        await assertNotLastOwner(prisma, tenantId, userId, newRole);
      } catch (err) {
        if (err instanceof Error && err.message === 'LAST_OWNER') {
          sendError(res, 409, 'LAST_OWNER', 'Cannot demote the last owner');
          return;
        }
        throw err;
      }

      try {
        const db = prisma as unknown as PrismaWithMembership;
        const updated = await db.tenantMembership.updateMany({
          where: { tenant_id: tenantId, user_id: userId, deleted_at: null },
          data: { role: newRole },
        });

        if (updated.count === 0) {
          sendError(res, 404, 'NOT_FOUND', 'Member not found');
          return;
        }

        sendSuccess(res, 200, { userId, tenantRole: newRole });
      } catch (err) {
        logger.error({ err }, 'Failed to update member role');
        sendError(res, 500, 'INTERNAL_ERROR', 'Failed to update member role');
      }
    },
  );

  router.delete(
    '/admin/tenants/:tenantId/members/:userId',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN, TenantRole.OWNER),
    async (req, res) => {
      const tenantId = req.params['tenantId'] as string;
      const userId = req.params['userId'] as string;

      try {
        await assertNotLastOwner(prisma, tenantId, userId, undefined);
      } catch (err) {
        if (err instanceof Error && err.message === 'LAST_OWNER') {
          sendError(res, 409, 'LAST_OWNER', 'Cannot remove the last owner');
          return;
        }
        throw err;
      }

      try {
        const db = prisma as unknown as PrismaWithMembership;
        const updated = await db.tenantMembership.updateMany({
          where: { tenant_id: tenantId, user_id: userId, deleted_at: null },
          data: { deleted_at: new Date() },
        });

        if (updated.count === 0) {
          sendError(res, 404, 'NOT_FOUND', 'Member not found');
          return;
        }

        sendSuccess(res, 204);
      } catch (err) {
        logger.error({ err }, 'Failed to remove member');
        sendError(res, 500, 'INTERNAL_ERROR', 'Failed to remove member');
      }
    },
  );

  return router;
}
