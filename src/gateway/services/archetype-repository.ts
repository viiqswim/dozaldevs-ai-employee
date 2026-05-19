import type { PrismaClient, Archetype } from '@prisma/client';

export class ActiveTasksError extends Error {
  constructor(public activeTaskCount: number) {
    super('ACTIVE_TASKS');
    this.name = 'ActiveTasksError';
  }
}

export class ArchetypeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async softDelete(id: string, tenantId: string): Promise<Archetype> {
    const existing = await this.prisma.archetype.findFirst({
      where: { id, tenant_id: tenantId },
    });
    if (!existing) {
      throw new Error('Archetype not found');
    }
    if (existing.deleted_at !== null) {
      return existing;
    }
    const activeTasks = await this.prisma.task.findMany({
      where: {
        archetype_id: id,
        status: { notIn: ['Done', 'Failed', 'Cancelled'] },
      },
    });
    if (activeTasks.length > 0) {
      throw new ActiveTasksError(activeTasks.length);
    }
    return this.prisma.archetype.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  async restore(id: string, tenantId: string): Promise<Archetype> {
    const existing = await this.prisma.archetype.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Archetype not found');
    }
    if (existing.tenant_id !== tenantId) {
      throw new Error('Archetype not found');
    }
    if (existing.deleted_at === null) {
      return existing;
    }
    const collision = await this.prisma.archetype.findFirst({
      where: {
        tenant_id: tenantId,
        role_name: existing.role_name,
        deleted_at: null,
        id: { not: id },
      },
    });
    if (collision) {
      throw new Error('role_name already taken by an active employee');
    }
    return this.prisma.archetype.update({
      where: { id },
      data: { deleted_at: null },
    });
  }
}
