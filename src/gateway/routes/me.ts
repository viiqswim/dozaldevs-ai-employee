import { Router } from 'express';
import { PrismaClient, Role } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth } from '../middleware/authz.js';
import { createLogger } from '../../lib/logger.js';
import { sendError, sendSuccess } from '../lib/http-response.js';

const logger = createLogger('me');

export interface MeRoutesOptions {
  prisma?: PrismaClient;
}

interface UserTenant {
  tenantId: string;
  name: string;
  slug: string;
  tenantRole: string;
}

export function meRoutes(opts: MeRoutesOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();

  // GET /me — return the authenticated user's profile
  router.get('/me', authMiddleware, requireAuth, (req, res) => {
    if (req.isServiceToken) {
      sendSuccess(res, 200, {
        id: null,
        email: null,
        name: null,
        globalRole: 'SERVICE',
        status: 'active',
      });
      return;
    }

    const user = req.auth!;
    sendSuccess(res, 200, {
      id: user.id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
      status: user.status,
    });
  });

  // GET /me/tenants — return the tenants the user belongs to.
  // PLATFORM_OWNER sees every non-deleted tenant; everyone else sees only their active memberships.
  router.get('/me/tenants', authMiddleware, requireAuth, async (req, res) => {
    if (req.isServiceToken) {
      // Service token is not a member of any tenant.
      sendSuccess(res, 200, []);
      return;
    }

    const user = req.auth!;

    try {
      let tenants: UserTenant[];

      if (user.globalRole === Role.PLATFORM_OWNER) {
        const allTenants = await prisma.tenant.findMany({
          where: { deleted_at: null },
          select: { id: true, name: true, slug: true },
        });
        tenants = allTenants.map((t) => ({
          tenantId: t.id,
          name: t.name,
          slug: t.slug,
          tenantRole: 'OWNER',
        }));
      } else {
        const memberships = await prisma.tenantMembership.findMany({
          where: { user_id: user.id, deleted_at: null },
          include: {
            tenant: { select: { id: true, name: true, slug: true, deleted_at: true } },
          },
        });
        tenants = memberships
          .filter((m) => m.tenant.deleted_at === null)
          .map((m) => ({
            tenantId: m.tenant_id,
            name: m.tenant.name,
            slug: m.tenant.slug,
            tenantRole: m.role,
          }));
      }

      sendSuccess(res, 200, tenants);
    } catch (err) {
      logger.error({ err }, 'Failed to list user tenants');
      sendError(res, 500, 'INTERNAL_ERROR');
    }
  });

  return router;
}
