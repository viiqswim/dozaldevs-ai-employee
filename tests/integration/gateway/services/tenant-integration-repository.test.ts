import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { getPrisma, disconnectPrisma } from '../../../setup.js';
import { TenantIntegrationRepository } from '../../../../src/gateway/services/tenant-integration-repository.js';
import { TenantRepository } from '../../../../src/repositories/tenant-repository.js';

let repo: TenantIntegrationRepository;
let tenantRepo: TenantRepository;
let testTenantId: string;

beforeEach(async () => {
  const prisma = getPrisma();
  repo = new TenantIntegrationRepository(prisma);
  tenantRepo = new TenantRepository(prisma);
  const tenant = await tenantRepo.create({
    name: 'Integration Test Org',
    slug: `int-test-${Date.now()}`,
  });
  testTenantId = tenant.id;
});

afterEach(async () => {
  const prisma = getPrisma();
  await prisma.tenantIntegration.deleteMany({ where: { tenant_id: testTenantId } });
  await prisma.tenant.deleteMany({ where: { id: testTenantId } });
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('TenantIntegrationRepository', () => {
  it('upsert: creates a new integration', async () => {
    const result = await repo.upsert(testTenantId, 'slack', { external_id: 'T12345' });
    expect(result.tenant_id).toBe(testTenantId);
    expect(result.provider).toBe('slack');
    expect(result.external_id).toBe('T12345');
    expect(result.status).toBe('active');
    expect(result.deleted_at).toBeNull();
  });

  it('upsert: updates an existing integration', async () => {
    await repo.upsert(testTenantId, 'slack', { external_id: 'T12345' });
    const updated = await repo.upsert(testTenantId, 'slack', { external_id: 'T99999' });
    expect(updated.external_id).toBe('T99999');
  });

  it('upsert: restores a soft-deleted integration', async () => {
    await repo.upsert(testTenantId, 'slack', { external_id: 'T12345' });
    await repo.delete(testTenantId, 'slack');
    const restored = await repo.upsert(testTenantId, 'slack', { external_id: 'T12345' });
    expect(restored.deleted_at).toBeNull();
  });

  it('upsert: stores optional config', async () => {
    const result = await repo.upsert(testTenantId, 'slack', {
      external_id: 'T12345',
      config: { bot_user_id: 'U123' },
    });
    expect(result.config).toEqual({ bot_user_id: 'U123' });
  });

  it('findByTenantAndProvider: returns matching integration', async () => {
    await repo.upsert(testTenantId, 'slack', { external_id: 'T12345' });
    const found = await repo.findByTenantAndProvider(testTenantId, 'slack');
    expect(found).not.toBeNull();
    expect(found!.external_id).toBe('T12345');
  });

  it('findByTenantAndProvider: returns null when not found', async () => {
    const found = await repo.findByTenantAndProvider(testTenantId, 'github');
    expect(found).toBeNull();
  });

  it('findByTenantAndProvider: excludes soft-deleted', async () => {
    await repo.upsert(testTenantId, 'slack', { external_id: 'T12345' });
    await repo.delete(testTenantId, 'slack');
    const found = await repo.findByTenantAndProvider(testTenantId, 'slack');
    expect(found).toBeNull();
  });

  it('findByExternalId: returns integration by provider + external_id', async () => {
    await repo.upsert(testTenantId, 'slack', { external_id: 'T_UNIQUE_99' });
    const found = await repo.findByExternalId('slack', 'T_UNIQUE_99');
    expect(found).not.toBeNull();
    expect(found!.tenant_id).toBe(testTenantId);
  });

  it('findByExternalId: returns null when not found', async () => {
    const found = await repo.findByExternalId('slack', 'T_NONEXISTENT');
    expect(found).toBeNull();
  });

  it('findByExternalId: excludes soft-deleted', async () => {
    await repo.upsert(testTenantId, 'slack', { external_id: 'T_SOFT_DEL' });
    await repo.delete(testTenantId, 'slack');
    const found = await repo.findByExternalId('slack', 'T_SOFT_DEL');
    expect(found).toBeNull();
  });

  it('delete: soft-deletes the integration', async () => {
    await repo.upsert(testTenantId, 'slack', { external_id: 'T12345' });
    await repo.delete(testTenantId, 'slack');
    const prisma = getPrisma();
    const raw = await prisma.tenantIntegration.findFirst({
      where: { tenant_id: testTenantId, provider: 'slack' },
    });
    expect(raw).not.toBeNull();
    expect(raw!.deleted_at).not.toBeNull();
  });

  it('delete: is a no-op when integration does not exist', async () => {
    await expect(repo.delete(testTenantId, 'nonexistent')).resolves.toBeUndefined();
  });

  it('no hardDelete method exists', () => {
    expect((repo as unknown as Record<string, unknown>).hardDelete).toBeUndefined();
  });

  describe('findManyByExternalId: shared slack team_id across tenants', () => {
    let secondTenantId: string;

    beforeEach(async () => {
      const prisma = getPrisma();
      const secondTenant = await new TenantRepository(prisma).create({
        name: 'Integration Test Org 2',
        slug: `int-test-2-${Date.now()}`,
      });
      secondTenantId = secondTenant.id;
    });

    afterEach(async () => {
      const prisma = getPrisma();
      await prisma.tenantIntegration.deleteMany({ where: { tenant_id: secondTenantId } });
      await prisma.tenant.deleteMany({ where: { id: secondTenantId } });
    });

    it('returns both rows when two tenants share the same external_id, ordered by created_at asc', async () => {
      await repo.upsert(testTenantId, 'slack', { external_id: 'T_SHARED_TEAM' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      await repo.upsert(secondTenantId, 'slack', { external_id: 'T_SHARED_TEAM' });

      const results = await repo.findManyByExternalId('slack', 'T_SHARED_TEAM');

      expect(results).toHaveLength(2);
      expect(results[0].tenant_id).toBe(testTenantId);
      expect(results[1].tenant_id).toBe(secondTenantId);
      expect(results[0].external_id).toBe('T_SHARED_TEAM');
      expect(results[1].external_id).toBe('T_SHARED_TEAM');
    });

    it('excludes soft-deleted rows from results', async () => {
      await repo.upsert(testTenantId, 'slack', { external_id: 'T_SHARED_SOFTDEL' });
      await repo.upsert(secondTenantId, 'slack', { external_id: 'T_SHARED_SOFTDEL' });

      await repo.delete(testTenantId, 'slack');

      const results = await repo.findManyByExternalId('slack', 'T_SHARED_SOFTDEL');

      expect(results).toHaveLength(1);
      expect(results[0].tenant_id).toBe(secondTenantId);
    });
  });
});
