/**
 * User data-access repository.
 *
 * Location rationale: This module uses Prisma and is consumed by both
 * `src/inngest/` and `src/gateway/`. Placing it in `src/repositories/`
 * keeps the layer boundary clean — Inngest functions should never import
 * from the Gateway layer.
 *
 * Worker containers MUST NOT import from this module (they use PostgREST).
 */
import type { PrismaClient, User } from '@prisma/client';

export type UserPatch = {
  email?: string;
  name?: string;
  status?: string;
};

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deleted_at: null },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email, deleted_at: null },
    });
  }

  async findBySupabaseId(supabaseId: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { supabase_id: supabaseId, deleted_at: null },
    });
  }

  async list(tenantId: string, opts?: { includeDeleted?: boolean }): Promise<User[]> {
    return this.prisma.user.findMany({
      where: {
        ...(opts?.includeDeleted ? {} : { deleted_at: null }),
        memberships: {
          some: {
            tenant_id: tenantId,
            deleted_at: null,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });
  }

  async update(id: string, patch: UserPatch): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(patch.email !== undefined && { email: patch.email }),
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.status !== undefined && { status: patch.status }),
      },
    });
  }

  async softDelete(id: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`User ${id} not found`);
    }
    if (existing.deleted_at !== null) {
      return existing;
    }
    return this.prisma.user.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async restore(id: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`User ${id} not found`);
    }
    return this.prisma.user.update({
      where: { id },
      data: { deleted_at: null },
    });
  }
}
