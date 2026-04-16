import type { PrismaClient, Tenant, Prisma } from '@prisma/client';

export type TenantPatch = {
  name?: string;
  config?: Prisma.InputJsonValue;
  status?: string;
  slack_team_id?: string | null;
};

export class TenantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    name: string;
    slug: string;
    config?: Prisma.InputJsonValue;
  }): Promise<Tenant> {
    return this.prisma.tenant.create({
      data: {
        name: input.name,
        slug: input.slug,
        config: input.config ?? undefined,
      },
    });
  }

  async findById(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { id, deleted_at: null },
    });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { slug, deleted_at: null },
    });
  }

  async findBySlackTeamId(teamId: string): Promise<Tenant | null> {
    return this.prisma.tenant.findFirst({
      where: { slack_team_id: teamId, deleted_at: null },
    });
  }

  async list(opts?: { includeDeleted?: boolean }): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      where: opts?.includeDeleted ? {} : { deleted_at: null },
      orderBy: { created_at: 'asc' },
    });
  }

  async update(id: string, patch: TenantPatch): Promise<Tenant> {
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(patch.name !== undefined && { name: patch.name }),
        ...(patch.config !== undefined && { config: patch.config }),
        ...(patch.status !== undefined && { status: patch.status }),
        ...(patch.slack_team_id !== undefined && { slack_team_id: patch.slack_team_id }),
      },
    });
  }

  async softDelete(id: string): Promise<Tenant> {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Tenant ${id} not found`);
    }
    if (existing.deleted_at !== null) {
      return existing;
    }
    return this.prisma.tenant.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async restore(id: string): Promise<Tenant> {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) {
      throw new Error(`Tenant ${id} not found`);
    }
    const collision = await this.prisma.tenant.findFirst({
      where: { slug: existing.slug, deleted_at: null, id: { not: id } },
    });
    if (collision) {
      throw new Error(
        `Cannot restore tenant ${id}: slug "${existing.slug}" is already taken by active tenant ${collision.id}`,
      );
    }
    return this.prisma.tenant.update({
      where: { id },
      data: { deleted_at: null },
    });
  }
}
