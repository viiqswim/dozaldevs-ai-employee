import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { getPrisma, disconnectPrisma } from '../../setup.js';
import { TenantIntegrationRepository } from '../../../src/gateway/services/tenant-integration-repository.js';
import { TenantRepository } from '../../../src/gateway/services/tenant-repository.js';

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
});
