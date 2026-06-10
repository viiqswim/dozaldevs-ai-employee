import { randomBytes } from 'crypto';
import { Router } from 'express';
import { PrismaClient, TenantRole } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import { requireAuth, requireTenantRole } from '../middleware/authz.js';
import { sendError, sendSuccess } from '../lib/http-response.js';
import { isPrismaError } from '../lib/prisma-helpers.js';
import { SUPABASE_URL, SUPABASE_SECRET_KEY, DASHBOARD_BASE_URL } from '../../lib/config.js';
import { createLogger } from '../../lib/logger.js';
import { setInvitationPasswordSchema } from '../validation/schemas.js';

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
    create: (args: unknown) => Promise<UserRecord>;
  };
  tenantMembership: {
    findFirst: (args: unknown) => Promise<MembershipRecord | null>;
    create: (args: unknown) => Promise<unknown>;
  };
};

type TenantRecord = {
  id: string;
  name: string;
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
  tenant: {
    findFirst: (args: unknown) => Promise<TenantRecord | null>;
  };
  $transaction: <T>(
    fn: (tx: TxLike) => Promise<T>,
    opts?: { isolationLevel?: string },
  ) => Promise<T>;
};

async function getSupabaseUserIdByEmail(email: string): Promise<string | null> {
  const url = `${SUPABASE_URL()}/auth/v1/admin/users?email=${encodeURIComponent(email)}`;
  const secretKey = SUPABASE_SECRET_KEY();
  const response = await fetch(url, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { users?: Array<{ id: string; email: string }> };
  const user = data.users?.find((u) => u.email === email);
  return user?.id ?? null;
}

async function confirmSupabaseUserEmail(supabaseUserId: string): Promise<void> {
  const url = `${SUPABASE_URL()}/auth/v1/admin/users/${supabaseUserId}`;
  const secretKey = SUPABASE_SECRET_KEY();
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify({ email_confirm: true }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase email confirmation failed: ${response.status} ${body}`);
  }
}

/**
 * Creates a Supabase Auth user with email_confirm: true (no magic link sent).
 * Returns the Supabase user ID on success, or null if the user already exists (422).
 */
async function createSupabaseUser(email: string): Promise<string | null> {
  const url = `${SUPABASE_URL()}/auth/v1/admin/users`;
  const secretKey = SUPABASE_SECRET_KEY();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify({ email, email_confirm: true }),
  });
  if (response.status === 422) {
    return null;
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase user creation failed: ${response.status} ${body}`);
  }
  const data = (await response.json()) as { id: string };
  return data.id;
}

const ROLE_RANK: Record<string, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

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

      let inviterRank = 5;
      if (!req.isServiceToken && req.auth?.globalRole !== 'PLATFORM_OWNER') {
        const inviterTenantRole = req.tenantContext?.tenantRole;
        inviterRank = inviterTenantRole ? (ROLE_RANK[inviterTenantRole] ?? 1) : 1;
      }
      const requestedRank = ROLE_RANK[role] ?? 1;
      if (requestedRank > inviterRank) {
        sendError(
          res,
          403,
          'INSUFFICIENT_ROLE',
          'You cannot invite someone with a higher role than your own',
        );
        return;
      }

      try {
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

        const existingInvite = await db.tenantInvitation.findFirst({
          where: { tenant_id: tenantId, email, status: 'pending' },
        });
        if (existingInvite) {
          await db.tenantInvitation.update({
            where: { id: existingInvite.id },
            data: { status: 'revoked', revoked_at: new Date() },
          });
        }

        try {
          const newSupabaseId = await createSupabaseUser(email);
          if (newSupabaseId === null) {
            const existingSupabaseId = await getSupabaseUserIdByEmail(email);
            if (existingSupabaseId) {
              await confirmSupabaseUserEmail(existingSupabaseId);
            }
          }
        } catch (err) {
          logger.error({ err }, 'Supabase user creation failed');
          sendError(res, 500, 'INVITE_FAILED', 'Failed to prepare invitation');
          return;
        }

        const token = randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const invitation = await db.tenantInvitation.create({
          data: {
            tenant_id: tenantId,
            email,
            role: role as TenantRole,
            token,
            status: 'pending',
            expires_at: expiresAt,
            inviter_id: req.auth?.id ?? null,
          },
        });

        let organizationName = tenantId;
        try {
          const tenant = await db.tenant.findFirst({ where: { id: tenantId } });
          if (tenant?.name) organizationName = tenant.name;
        } catch (_ignored) {
          organizationName = tenantId;
        }

        const acceptUrl = `${DASHBOARD_BASE_URL()}/dashboard/accept-invite?token=${token}`;
        const inviterName = req.auth?.name ?? req.auth?.email ?? undefined;

        try {
          const { getEmailProvider } = await import('../../lib/email/index.js');
          const { buildInvitationEmail } = await import('../../lib/email/templates/invitation.js');
          const emailContent = buildInvitationEmail({
            acceptUrl,
            organizationName,
            inviterName,
            role,
          });
          await getEmailProvider().send({ to: email, ...emailContent });
        } catch (emailErr) {
          logger.error({ err: emailErr }, 'Failed to send invitation email');
          await db.tenantInvitation.update({
            where: { id: invitation.id },
            data: { status: 'revoked', revoked_at: new Date() },
          });
          sendError(res, 500, 'INVITE_EMAIL_FAILED', 'Failed to send invitation email');
          return;
        }

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

    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 50 * attempt));
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

            let user = await tx.user.findFirst({
              where: { email: invitation.email, deleted_at: null },
            });

            if (req.auth && req.auth.email === invitation.email) {
              const authUser = await tx.user.findFirst({
                where: { id: req.auth.id, deleted_at: null },
              });
              if (authUser) {
                user = authUser;
              }
            }

            if (!user) {
              const supabaseId = await getSupabaseUserIdByEmail(invitation.email);
              user = await tx.user.create({
                data: {
                  supabase_id: supabaseId ?? null,
                  email: invitation.email,
                  name: null,
                  role: 'USER',
                  status: 'active',
                },
              });
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
        return;
      } catch (err) {
        if (isPrismaError(err) && err.code === 'P2034') {
          logger.warn(
            { attempt: attempt + 1, maxRetries: MAX_RETRIES },
            'Serialization failure on accept invitation, retrying',
          );
          continue;
        }
        if (err instanceof Error && 'status' in err) {
          const e = err as Error & { code: string; status: number };
          sendError(res, e.status, e.code, err.message);
          return;
        }
        logger.error({ err }, 'Failed to accept invitation');
        sendError(res, 500, 'INTERNAL_ERROR', 'Failed to accept invitation');
        return;
      }
    }

    logger.error(
      { token: token.slice(0, 8) },
      'Serialization failure persisted after all retries on accept invitation',
    );
    sendError(res, 409, 'SERIALIZATION_FAILURE', 'Transaction conflict — please retry');
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

  // POST /invitations/set-password — no auth required; token-bound
  router.post('/invitations/set-password', async (req, res) => {
    const parseResult = setInvitationPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      sendError(res, 400, 'INVALID_INPUT', parseResult.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    const { token, password } = parseResult.data;

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
      if (invitation.expires_at < new Date()) {
        sendError(res, 410, 'EXPIRED', 'Invitation has expired');
        return;
      }

      const supabaseUserId = await getSupabaseUserIdByEmail(invitation.email);
      if (!supabaseUserId) {
        sendError(res, 404, 'USER_NOT_FOUND', 'No account found for this invitation');
        return;
      }

      // Set password via Supabase admin API (server-side only — never expose secret key)
      const setPasswordUrl = `${SUPABASE_URL()}/auth/v1/admin/users/${supabaseUserId}`;
      const secretKey = SUPABASE_SECRET_KEY();
      const pwResponse = await fetch(setPasswordUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          apikey: secretKey,
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify({ password }),
      });

      if (!pwResponse.ok) {
        logger.error(
          { status: pwResponse.status },
          'Failed to set password via Supabase admin API',
        );
        sendError(res, 500, 'SET_PASSWORD_FAILED', `Failed to set password: ${pwResponse.status}`);
        return;
      }

      sendSuccess(res, 200, { message: 'Password set successfully' });
    } catch (err) {
      logger.error({ err }, 'Failed to set invitation password');
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to set password');
    }
  });

  // GET /invitations/:token — public; returns safe fields for the acceptance page
  router.get('/invitations/:token', async (req, res) => {
    const token = req.params['token'] as string;
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

      // Resolve organization name (non-fatal: fall back to tenant_id)
      let organizationName = invitation.tenant_id;
      try {
        const tenant = await db.tenant.findFirst({ where: { id: invitation.tenant_id } });
        if (tenant?.name) organizationName = tenant.name;
      } catch {
        // non-fatal: use tenant_id as fallback
      }

      // isExistingUser: true if a users row exists for this email (they've signed in before)
      const existingUser = await db.user.findFirst({
        where: { email: invitation.email, deleted_at: null },
      });

      sendSuccess(res, 200, {
        email: invitation.email,
        organizationName,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expires_at,
        isExistingUser: existingUser !== null,
      });
    } catch (err) {
      logger.error({ err }, 'Failed to look up invitation');
      sendError(res, 500, 'INTERNAL_ERROR', 'Failed to look up invitation');
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
