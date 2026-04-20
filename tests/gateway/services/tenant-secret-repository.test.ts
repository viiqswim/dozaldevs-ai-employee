import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { vi } from 'vitest';
import { getPrisma, disconnectPrisma } from '../../setup.js';
import { TenantSecretRepository } from '../../../src/gateway/services/tenant-secret-repository.js';

const VALID_KEY = 'a'.repeat(64);
const TENANT_A = '00000000-0000-0000-0000-000000000002';
const TENANT_B = '00000000-0000-0000-0000-000000000003';
const DOZALDEVS_TENANT_ID = '00000000-0000-0000-0000-000000000002';

let repo: TenantSecretRepository;

beforeEach(async () => {
  vi.stubEnv('ENCRYPTION_KEY', VALID_KEY);
  repo = new TenantSecretRepository(getPrisma());
  const prisma = getPrisma();
  await prisma.tenantSecret.deleteMany({ where: { tenant_id: { in: [TENANT_A, TENANT_B] } } });
  await prisma.tenant.upsert({
    where: { id: TENANT_A },
    create: { id: TENANT_A, name: 'DozalDevs', slug: 'dozal-devs-test' },
    update: {},
  });
  await prisma.tenant.upsert({
    where: { id: TENANT_B },
    create: { id: TENANT_B, name: 'VLRE', slug: 'vlre-test' },
    update: {},
  });
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const prisma = getPrisma();
  await prisma.tenantSecret.deleteMany({ where: { tenant_id: { in: [TENANT_A, TENANT_B] } } });
  await prisma.tenant.deleteMany({ where: { id: { in: [TENANT_A, TENANT_B] } } });
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('TenantSecretRepository', () => {
  it('set + get roundtrip returns plaintext exactly', async () => {
    await repo.set(TENANT_A, 'slack_bot_token', 'xoxb-secret-value');
    const result = await repo.get(TENANT_A, 'slack_bot_token');
    expect(result).toBe('xoxb-secret-value');
  });

  it('listKeys does not return plaintext or ciphertext', async () => {
    await repo.set(TENANT_A, 'github_token', 'ghp-secret');
    const keys = await repo.listKeys(TENANT_A);
    expect(keys).toHaveLength(1);
    expect(keys[0].key).toBe('github_token');
    expect(keys[0].is_set).toBe(true);
    expect(keys[0].updated_at).toBeInstanceOf(Date);
    const raw = JSON.stringify(keys[0]);
    expect(raw).not.toContain('ghp-secret');
    expect(raw).not.toContain('ciphertext');
    expect(raw).not.toContain('iv');
    expect(raw).not.toContain('auth_tag');
  });

  it('upsert: setting same key twice updates ciphertext with different IV', async () => {
    await repo.set(TENANT_A, 'api_key', 'first-value');
    const prisma = getPrisma();
    const before = await prisma.tenantSecret.findUnique({
      where: { tenant_id_key: { tenant_id: TENANT_A, key: 'api_key' } },
    });
    await repo.set(TENANT_A, 'api_key', 'second-value');
    const after = await prisma.tenantSecret.findUnique({
      where: { tenant_id_key: { tenant_id: TENANT_A, key: 'api_key' } },
    });
    expect(before!.iv).not.toBe(after!.iv);
    expect(before!.ciphertext).not.toBe(after!.ciphertext);
    const result = await repo.get(TENANT_A, 'api_key');
    expect(result).toBe('second-value');
  });

  it('delete: removes row; subsequent get returns null', async () => {
    await repo.set(TENANT_A, 'to_delete', 'value');
    const deleted = await repo.delete(TENANT_A, 'to_delete');
    expect(deleted).toBe(true);
    const result = await repo.get(TENANT_A, 'to_delete');
    expect(result).toBeNull();
  });

  it('delete: returns false for non-existent key', async () => {
    const result = await repo.delete(TENANT_A, 'nonexistent');
    expect(result).toBe(false);
  });

  it('cross-tenant isolation: tenant A secret not returned for tenant B', async () => {
    await repo.set(TENANT_A, 'shared_key', 'secret-A');
    await repo.set(TENANT_B, 'shared_key', 'secret-B');
    expect(await repo.get(TENANT_A, 'shared_key')).toBe('secret-A');
    expect(await repo.get(TENANT_B, 'shared_key')).toBe('secret-B');
  });

  it('getMany: returns only keys that exist', async () => {
    await repo.set(TENANT_A, 'key_one', 'val-one');
    await repo.set(TENANT_A, 'key_two', 'val-two');
    const result = await repo.getMany(TENANT_A, ['key_one', 'key_two', 'missing_key']);
    expect(result['key_one']).toBe('val-one');
    expect(result['key_two']).toBe('val-two');
    expect(result['missing_key']).toBeUndefined();
  });

  it('DB ciphertext is not plaintext', async () => {
    const plaintext = 'super-secret-token-xyz';
    await repo.set(TENANT_A, 'test_key', plaintext);
    const prisma = getPrisma();
    const record = await prisma.tenantSecret.findUnique({
      where: { tenant_id_key: { tenant_id: TENANT_A, key: 'test_key' } },
    });
    expect(record!.ciphertext).not.toContain(plaintext);
    expect(record!.ciphertext).not.toBe(plaintext);
  });
});
