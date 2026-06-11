/**
 * Composio connection data-access repository.
 *
 * Location rationale: Uses Prisma; consumed by `src/gateway/` services that
 * manage the Composio OAuth connect/disconnect flow and by `src/inngest/`
 * when recording per-task tool-call audit rows. Lives in `src/repositories/`
 * so each layer can import it without crossing architectural boundaries.
 * Worker containers MUST NOT import this module — they use PostgREST.
 *
 * Tenant-scoped: every read and write is keyed by `tenant_id`. Connections
 * are soft-deleted via `deleted_at` (never hard-deleted).
 */
import type { PrismaClient, ComposioConnection } from '@prisma/client';

export class ComposioConnectionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getActiveConnections(tenantId: string): Promise<ComposioConnection[]> {
    return this.prisma.composioConnection.findMany({
      where: { tenant_id: tenantId, status: 'active', deleted_at: null },
      orderBy: { connected_at: 'desc' },
    });
  }

  async getConnection(tenantId: string, toolkit: string): Promise<ComposioConnection | null> {
    return this.prisma.composioConnection.findFirst({
      where: { tenant_id: tenantId, toolkit, deleted_at: null },
    });
  }

  async upsertConnection(tenantId: string, toolkit: string): Promise<ComposioConnection> {
    return this.prisma.composioConnection.upsert({
      where: { tenant_id_toolkit: { tenant_id: tenantId, toolkit } },
      create: {
        tenant_id: tenantId,
        toolkit,
        status: 'active',
      },
      update: {
        status: 'active',
        disconnected_at: null,
        deleted_at: null,
        connected_at: new Date(),
      },
    });
  }

  async disconnectConnection(tenantId: string, toolkit: string): Promise<void> {
    await this.prisma.composioConnection.updateMany({
      where: { tenant_id: tenantId, toolkit, deleted_at: null },
      data: { status: 'disconnected', disconnected_at: new Date() },
    });
  }

  async softDeleteConnection(tenantId: string, toolkit: string): Promise<void> {
    await this.prisma.composioConnection.updateMany({
      where: { tenant_id: tenantId, toolkit },
      data: { deleted_at: new Date() },
    });
  }

  async recordToolCall(
    taskId: string,
    tenantId: string,
    toolkit: string,
    toolName: string,
  ): Promise<void> {
    await this.prisma.taskComposioCall.create({
      data: {
        task_id: taskId,
        tenant_id: tenantId,
        toolkit,
        tool_name: toolName,
      },
    });
  }
}
