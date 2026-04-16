import type { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../../lib/encryption.js';

export type SecretMeta = {
  key: string;
  is_set: true;
  updated_at: Date;
};

export class TenantSecretRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async set(tenantId: string, key: string, plaintext: string): Promise<SecretMeta> {
    const payload = encrypt(plaintext);
    const record = await this.prisma.tenantSecret.upsert({
      where: { tenant_id_key: { tenant_id: tenantId, key } },
      create: {
        tenant_id: tenantId,
        key,
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        auth_tag: payload.auth_tag,
      },
      update: {
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        auth_tag: payload.auth_tag,
      },
    });
    return { key: record.key, is_set: true, updated_at: record.updated_at };
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    const record = await this.prisma.tenantSecret.findUnique({
      where: { tenant_id_key: { tenant_id: tenantId, key } },
    });
    if (!record) return null;
    return decrypt({ ciphertext: record.ciphertext, iv: record.iv, auth_tag: record.auth_tag });
  }

  async listKeys(tenantId: string): Promise<SecretMeta[]> {
    const records = await this.prisma.tenantSecret.findMany({
      where: { tenant_id: tenantId },
      select: { key: true, updated_at: true },
      orderBy: { key: 'asc' },
    });
    return records.map((r) => ({ key: r.key, is_set: true as const, updated_at: r.updated_at }));
  }

  async delete(tenantId: string, key: string): Promise<boolean> {
    const existing = await this.prisma.tenantSecret.findUnique({
      where: { tenant_id_key: { tenant_id: tenantId, key } },
    });
    if (!existing) return false;
    await this.prisma.tenantSecret.delete({
      where: { tenant_id_key: { tenant_id: tenantId, key } },
    });
    return true;
  }

  async getMany(tenantId: string, keys: string[]): Promise<Record<string, string>> {
    const records = await this.prisma.tenantSecret.findMany({
      where: { tenant_id: tenantId, key: { in: keys } },
    });
    const result: Record<string, string> = {};
    for (const record of records) {
      result[record.key] = decrypt({
        ciphertext: record.ciphertext,
        iv: record.iv,
        auth_tag: record.auth_tag,
      });
    }
    return result;
  }
}
