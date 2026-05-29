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
    return this.prisma.$transaction(async (tx) => {
      const activeTasks = await tx.task.findMany({
        where: {
          archetype_id: id,
          status: { notIn: ['Done', 'Failed', 'Cancelled'] },
        },
        select: { id: true, status: true },
      });

      for (const task of activeTasks) {
        await tx.task.update({
          where: { id: task.id },
          data: { status: 'Cancelled' },
        });
        await tx.taskStatusLog.create({
          data: {
            task_id: task.id,
            from_status: task.status,
            to_status: 'Cancelled',
            actor: 'gateway',
          },
        });
        await tx.pendingApproval.deleteMany({
          where: { task_id: task.id },
        });
      }

      return tx.archetype.update({
        where: { id },
        data: { deleted_at: new Date(), status: 'inactive' },
      });
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
      data: { deleted_at: null, status: 'active' },
    });
  }
}
