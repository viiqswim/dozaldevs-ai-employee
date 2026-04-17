import type { PrismaClient, TenantIntegration, Prisma } from '@prisma/client';

export type TenantIntegrationUpsertInput = {
  external_id: string;
  config?: Prisma.InputJsonValue;
  status?: string;
};

export class TenantIntegrationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByTenantAndProvider(
    tenantId: string,
    provider: string,
  ): Promise<TenantIntegration | null> {
    return this.prisma.tenantIntegration.findFirst({
      where: { tenant_id: tenantId, provider, deleted_at: null },
    });
  }

  async findByExternalId(provider: string, externalId: string): Promise<TenantIntegration | null> {
    return this.prisma.tenantIntegration.findFirst({
      where: { provider, external_id: externalId, deleted_at: null },
    });
  }

  async upsert(
    tenantId: string,
    provider: string,
    data: TenantIntegrationUpsertInput,
  ): Promise<TenantIntegration> {
    return this.prisma.tenantIntegration.upsert({
      where: { tenant_id_provider: { tenant_id: tenantId, provider } },
      create: {
        tenant_id: tenantId,
        provider,
        external_id: data.external_id,
        config: data.config ?? undefined,
        status: data.status ?? 'active',
      },
      update: {
        external_id: data.external_id,
        config: data.config ?? undefined,
        status: data.status ?? 'active',
        deleted_at: null,
      },
    });
  }

  async delete(tenantId: string, provider: string): Promise<void> {
    const existing = await this.prisma.tenantIntegration.findFirst({
      where: { tenant_id: tenantId, provider, deleted_at: null },
    });
    if (!existing) return;
    await this.prisma.tenantIntegration.update({
      where: { id: existing.id },
      data: { deleted_at: new Date() },
    });
  }
}
