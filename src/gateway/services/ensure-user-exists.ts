import { PrismaClient } from '@prisma/client';
import type { SupabaseJwtClaims, AuthenticatedUser } from '../../lib/auth/types.js';

const prisma = new PrismaClient();

export async function ensureUserExists(claims: SupabaseJwtClaims): Promise<AuthenticatedUser> {
  const user = await prisma.user.upsert({
    where: { supabase_id: claims.sub },
    update: { email: claims.email ?? '' },
    create: {
      supabase_id: claims.sub,
      email: claims.email ?? '',
      name: null,
      role: 'USER',
      status: 'active',
    },
  });

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
