import { randomBytes } from 'crypto';
import { Router } from 'express';
import { PrismaClient, TenantRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { SUPABASE_URL, SUPABASE_SECRET_KEY } from '../../lib/config.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('admin-invitations');

export interface AdminInvitationsRoutesOptions {
  prisma?: PrismaClient;
}

type InvitationRecord = {
  id: string;
  tenant_id: string;
  email: string;
  role: TenantRole;
  status: string;
  expires_at: Date;
};

type UserRecord = {
  id: string;
  email: string;
};

type MembershipRecord = {
  tenant_id: string;
  user_id: string;
  role: TenantRole;
};

type TxLike = {
  tenantInvitation: {
    findFirst: (args: unknown) => Promise<InvitationRecord | null>;
    update: (args: unknown) => Promise<unknown>;
  };
  user: {
    findFirst: (args: unknown) => Promise<UserRecord | null>;
  };
  tenantMembership: {
    findFirst: (args: unknown) => Promise<MembershipRecord | null>;
    create: (args: unknown) => Promise<unknown>;
  };
};

type PrismaWithInvitation = {
  tenantInvitation: {
    findFirst: (args: unknown) => Promise<InvitationRecord | null>;
    create: (args: unknown) => Promise<InvitationRecord>;
    update: (args: unknown) => Promise<unknown>;
  };
  user: {
    findFirst: (args: unknown) => Promise<UserRecord | null>;
  };
  tenantMembership: {
    findFirst: (args: unknown) => Promise<MembershipRecord | null>;
  };
  $transaction: <T>(
    fn: (tx: TxLike) => Promise<T>,
    opts?: { isolationLevel?: string },
  ) => Promise<T>;
};

async function sendSupabaseInvite(email: string): Promise<void> {
  const url = `${SUPABASE_URL()}/auth/v1/admin/users`;
  const secretKey = SUPABASE_SECRET_KEY();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify({ email, email_confirm: false, invite: true }),
  });
  if (!response.ok && response.status !== 422) {
    const body = await response.text();
    throw new Error(`Supabase invite failed: ${response.status} ${body}`);
  }
}

export function adminInvitationsRoutes(opts: AdminInvitationsRoutesOptions = {}): Router {
  const router = Router();
  const prisma = opts.prisma ?? new PrismaClient();
  const db = prisma as unknown as PrismaWithInvitation;

  // POST /admin/tenants/:tenantId/invitations — create invitation
  router.post(
    '/admin/tenants/:tenantId/invitations',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN, TenantRole.OWNER),
    async (req, res) => {
      const tenantId = req.params['tenantId'] as string;
      const { email, role } = req.body as { email?: string; role?: string };

      if (!email || typeof email !== 'string') {
        sendError(res, 400, 'INVALID_EMAIL', 'Email is required');
        return;
      }
      if (!role || !Object.values(TenantRole).includes(role as TenantRole)) {
        sendError(res, 400, 'INVALID_ROLE', 'Invalid role');
        return;
      }

      try {
        // Check if email belongs to an existing member
        const existingUser = await db.user.findFirst({
          where: { email, deleted_at: null },
        });
        if (existingUser) {
          const existingMembership = await db.tenantMembership.findFirst({
            where: { tenant_id: tenantId, user_id: existingUser.id, deleted_at: null },
          });
          if (existingMembership) {
            sendError(res, 409, 'ALREADY_MEMBER', 'User is already a member of this tenant');
            return;
          }
        }

        // Send Supabase invite email
        try {
          await sendSupabaseInvite(email);
        } catch (err) {
          logger.error({ err }, 'Supabase invite email failed');
          sendError(res, 500, 'INVITE_FAILED', 'Failed to send invitation email');
          return;
        }

        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const invitation = await db.tenantInvitation.create({
          data: {
            tenant_id: tenantId,
            email,
            role: role as TenantRole,
            token,
            status: 'pending',
            expires_at: expiresAt,
          },
        });

        sendSuccess(res, 201, {
          id: invitation.id,
          email: invitation.email,
          role: invitation.role,
          status: invitation.status,
          expiresAt: invitation.expires_at,
        });
      } catch (err) {
        logger.error({ err }, 'Failed to create invitation');
        sendError(res, 500, 'INTERNAL_ERROR', 'Failed to create invitation');
      }
    },
  );

  // POST /invitations/accept — no auth required (user may not be logged in yet)
  router.post('/invitations/accept', async (req, res) => {
    const { token } = req.body as { token?: string };
    if (!token) {
      sendError(res, 400, 'MISSING_TOKEN', 'Token is required');
      return;
    }

    try {
      await db.$transaction(
        async (tx) => {
          const invitation = await tx.tenantInvitation.findFirst({
            where: { token },
          });

          if (!invitation) {
            throw Object.assign(new Error('Invitation not found'), {
              code: 'NOT_FOUND',
              status: 404,
            });
          }
          if (invitation.status !== 'pending') {
            throw Object.assign(new Error('Invitation is no longer pending'), {
              code: 'ALREADY_USED',
              status: 410,
            });
          }
          if (invitation.expires_at < new Date()) {
            throw Object.assign(new Error('Invitation has expired'), {
              code: 'EXPIRED',
              status: 410,
            });
          }

          const user = await tx.user.findFirst({
            where: { email: invitation.email, deleted_at: null },
          });
          if (!user) {
            throw Object.assign(
              new Error('User not found — complete registration via the magic link first'),
              { code: 'USER_NOT_FOUND', status: 404 },
            );
          }

          const existingMembership = await tx.tenantMembership.findFirst({
            where: { tenant_id: invitation.tenant_id, user_id: user.id, deleted_at: null },
          });
          if (existingMembership) {
            throw Object.assign(new Error('User is already a member of this tenant'), {
              code: 'ALREADY_MEMBER',
              status: 409,
            });
          }

          await tx.tenantMembership.create({
            data: {
              tenant_id: invitation.tenant_id,
              user_id: user.id,
              role: invitation.role,
            },
          });

          await tx.tenantInvitation.update({
            where: { id: invitation.id },
            data: { status: 'accepted', accepted_at: new Date() },
          });
        },
        { isolationLevel: 'Serializable' },
      );

      sendSuccess(res, 200, { message: 'Invitation accepted' });
    } catch (err) {
      if (err instanceof Error && 'code' in err) {
        const e = err as Error & { code: string; status: number };
        sendError(res, e.status, e.code, err.message);
        return;
      }
      logger.error({ err }, 'Failed to accept invitation');
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to accept invitation');
    }
  });

  // POST /invitations/decline — no auth required
  router.post('/invitations/decline', async (req, res) => {
    const { token } = req.body as { token?: string };
    if (!token) {
      sendError(res, 400, 'MISSING_TOKEN', 'Token is required');
      return;
    }

    try {
      const invitation = await db.tenantInvitation.findFirst({ where: { token } });
      if (!invitation) {
        sendError(res, 404, 'NOT_FOUND', 'Invitation not found');
        return;
      }
      if (invitation.status !== 'pending') {
        sendError(res, 410, 'ALREADY_USED', 'Invitation is no longer pending');
        return;
      }

      await db.tenantInvitation.update({
        where: { id: invitation.id },
        data: { status: 'declined', declined_at: new Date() },
      });

      sendSuccess(res, 200, { message: 'Invitation declined' });
    } catch (err) {
      logger.error({ err }, 'Failed to decline invitation');
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to decline invitation');
    }
  });

  // POST /admin/tenants/:tenantId/invitations/:invitationId/revoke
  router.post(
    '/admin/tenants/:tenantId/invitations/:invitationId/revoke',
    authMiddleware,
    requireAuth,
    requireTenantRole(TenantRole.ADMIN, TenantRole.OWNER),
    async (req, res) => {
      const tenantId = req.params['tenantId'] as string;
      const invitationId = req.params['invitationId'] as string;

      try {
        const invitation = await db.tenantInvitation.findFirst({
          where: { id: invitationId, tenant_id: tenantId },
        });
        if (!invitation) {
          sendError(res, 404, 'NOT_FOUND', 'Invitation not found');
          return;
        }
        if (invitation.status !== 'pending') {
          sendError(res, 409, 'NOT_PENDING', 'Invitation is not pending');
          return;
        }

        await db.tenantInvitation.update({
          where: { id: invitationId },
          data: { status: 'revoked', revoked_at: new Date() },
        });

        sendSuccess(res, 200, { message: 'Invitation revoked' });
      } catch (err) {
        logger.error({ err }, 'Failed to revoke invitation');
        sendError(res, 500, 'INTERNAL_ERROR', 'Failed to revoke invitation');
      }
    },
  );

  return router;
}
