import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PrismaClient } from '@prisma/client';

vi.mock('../../../../src/lib/encryption.js', () => ({
  encrypt: vi.fn(() => ({ ciphertext: 'enc', iv: 'iv', auth_tag: 'tag' })),
  decrypt: vi.fn(() => 'decrypted'),
}));

import { TenantSecretRepository } from '../../../../src/gateway/services/tenant-secret-repository.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000003';

function makeMockPrisma() {
  return {
    tenantSecret: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
  } as unknown as PrismaClient;
}

describe('TenantSecretRepository — case-insensitive key lookups', () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  let repo: TenantSecretRepository;

  beforeEach(() => {
    prisma = makeMockPrisma();
    repo = new TenantSecretRepository(prisma as unknown as PrismaClient);
  });

  it('set() stores with lowercase key', async () => {
    (prisma.tenantSecret.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      key: 'slack_bot_token',
      updated_at: new Date(),
    });

    await repo.set(TENANT_ID, 'SLACK_BOT_TOKEN', 'tok');

    const call = (prisma.tenantSecret.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.tenant_id_key.key).toBe('slack_bot_token');
    expect(call.create.key).toBe('slack_bot_token');
  });

  it('get() lowercases before lookup', async () => {
    (prisma.tenantSecret.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await repo.get(TENANT_ID, 'SLACK_BOT_TOKEN');

    const call = (prisma.tenantSecret.findUnique as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.tenant_id_key.key).toBe('slack_bot_token');
  });

  it('get() with mixed case lowercases before lookup', async () => {
    (prisma.tenantSecret.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await repo.get(TENANT_ID, 'Mixed_Case_Key');

    const call = (prisma.tenantSecret.findUnique as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.tenant_id_key.key).toBe('mixed_case_key');
  });

  it('delete() lowercases before lookup', async () => {
    (prisma.tenantSecret.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await repo.delete(TENANT_ID, 'SLACK_BOT_TOKEN');

    const call = (prisma.tenantSecret.findUnique as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.tenant_id_key.key).toBe('slack_bot_token');
  });

  it('getMany() lowercases all keys', async () => {
    (prisma.tenantSecret.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await repo.getMany(TENANT_ID, ['SLACK_BOT_TOKEN', 'OTHER_KEY']);

    const call = (prisma.tenantSecret.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.key).toEqual({ in: ['slack_bot_token', 'other_key'] });
  });
});
