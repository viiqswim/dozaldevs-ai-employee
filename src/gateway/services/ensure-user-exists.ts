import { PrismaClient } from '@prisma/client';
import type { SupabaseJwtClaims, AuthenticatedUser } from '../../lib/auth/types.js';
import { isPrismaError } from '../lib/prisma-helpers.js';

const prisma = new PrismaClient();

/**
 * Find-or-create a users row for the given Supabase JWT claims.
 *
 * Concurrency safety: the primary path is a Prisma upsert keyed on `supabase_id`.
 * Under concurrent first-login (e.g. AuthContext firing /me and /me/tenants in
 * parallel), two upserts can race and the second insert hits the `users.email`
 * unique constraint (P2002). When that happens we re-fetch the row that the
 * winning insert created and return it — no duplicate is created.
 *
 * The catch is narrowed to P2002 only. Every other error is re-thrown unchanged.
 */
export async function ensureUserExists(claims: SupabaseJwtClaims): Promise<AuthenticatedUser> {
  let user;

  try {
    user = await prisma.user.upsert({
      where: { supabase_id: claims.sub },
      update: {
        // Only update email when the claim carries a non-empty value.
        // Blanking the stored email when the claim is absent would be destructive.
        ...(claims.email ? { email: claims.email } : {}),
      },
      create: {
        supabase_id: claims.sub,
        email: claims.email ?? '',
        name: null,
        role: 'USER',
        status: 'active',
      },
    });
  } catch (err) {
    // P2002 = unique-constraint violation. This happens when two concurrent
    // first-login requests both attempt to INSERT the same identity and the
    // second one loses the race. Re-fetch the row the winner created.
    if (isPrismaError(err) && err.code === 'P2002') {
      const existing =
        (await prisma.user.findFirst({ where: { supabase_id: claims.sub } })) ??
        (claims.email ? await prisma.user.findFirst({ where: { email: claims.email } }) : null);

      if (!existing) {
        // Should never happen — the constraint violation means a row exists.
        throw err;
      }

      user = existing;
    } else {
      throw err;
    }
  }

  if (user.deleted_at !== null) {
    throw new Error('User account has been deleted');
  }

  return {
    id: user.id,
    supabaseId: user.supabase_id!,
    email: user.email,
    name: user.name ?? null,
    globalRole: user.role,
    status: user.status,
  };
}
