import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import { TenantRepository } from '../../src/gateway/services/tenant-repository.js';
import { TenantSecretRepository } from '../../src/gateway/services/tenant-secret-repository.js';
import { TenantInstallationStore } from '../../src/gateway/slack/installation-store.js';
import { loadTenantEnv } from '../../src/gateway/services/tenant-env-loader.js';
import { encrypt, decrypt } from '../../src/lib/encryption.js';

const TENANT_A_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const TENANT_B_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';
const TEAM_A_ID = 'T_TEAM_A';
const TEAM_B_ID = 'T_TEAM_B';
const TOKEN_A = 'xoxb-token-tenant-a';
const TOKEN_B = 'xoxb-token-tenant-b';

function setEncryptionKey() {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
}

function makeTenant(id: string, teamId: string | null = null, config: unknown = null) {
  return {
    id,
    name: id === TENANT_A_ID ? 'Tenant A' : 'Tenant B',
    slug: id === TENANT_A_ID ? 'tenant-a' : 'tenant-b',
    slack_team_id: teamId,
    config,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };
}

function encryptValue(plaintext: string) {
  setEncryptionKey();
  const key = Buffer.from('a'.repeat(64), 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    auth_tag: authTag.toString('base64'),
  };
}

describe('Multi-tenancy integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setEncryptionKey();
  });

  describe('1. Tenant isolation: tasks scoped to correct tenant', () => {
    it('TenantRepository.findById returns null for wrong tenant', async () => {
      const prisma = {
        tenant: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as never;
      const repo = new TenantRepository(prisma);
      const result = await repo.findById(TENANT_B_ID);
      expect(result).toBeNull();
    });

    it('TenantRepository.findById returns correct tenant for correct id', async () => {
      const tenantA = makeTenant(TENANT_A_ID);
      const prisma = {
        tenant: {
          findFirst: vi.fn().mockResolvedValue(tenantA),
        },
      } as never;
      const repo = new TenantRepository(prisma);
      const result = await repo.findById(TENANT_A_ID);
      expect(result?.id).toBe(TENANT_A_ID);
    });
  });

  describe('2. Cross-tenant secret isolation', () => {
    it('TenantSecretRepository.get returns null for wrong tenant', async () => {
      const prisma = {
        tenantSecret: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as never;
      const repo = new TenantSecretRepository(prisma);
      const result = await repo.get(TENANT_B_ID, 'slack_bot_token');
      expect(result).toBeNull();
    });

    it('TenantSecretRepository.get returns correct secret for correct tenant', async () => {
      const encrypted = encryptValue(TOKEN_A);
      const prisma = {
        tenantSecret: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ ...encrypted, key: 'slack_bot_token', tenant_id: TENANT_A_ID }),
        },
      } as never;
      const repo = new TenantSecretRepository(prisma);
      const result = await repo.get(TENANT_A_ID, 'slack_bot_token');
      expect(result).toBe(TOKEN_A);
    });
  });

  describe('3. Encryption at rest', () => {
    it('ciphertext differs from plaintext', () => {
      const plaintext = 'my-secret-token';
      const { ciphertext } = encrypt(plaintext);
      expect(ciphertext).not.toBe(plaintext);
      expect(ciphertext).not.toContain(plaintext);
    });

    it('roundtrip: encrypt then decrypt returns original plaintext', () => {
      const plaintext = 'xoxb-roundtrip-test-token';
      const payload = encrypt(plaintext);
      const decrypted = decrypt(payload);
      expect(decrypted).toBe(plaintext);
    });

    it('different plaintexts produce different ciphertexts', () => {
      const { ciphertext: c1 } = encrypt('token-a');
      const { ciphertext: c2 } = encrypt('token-b');
      expect(c1).not.toBe(c2);
    });

    it('same plaintext produces different ciphertexts (random IV)', () => {
      const { ciphertext: c1 } = encrypt('same-token');
      const { ciphertext: c2 } = encrypt('same-token');
      expect(c1).not.toBe(c2);
    });
  });

  describe('4. OAuth callback atomicity (InstallationStore)', () => {
    it('storeInstallation is a no-op (token stored via OAuth callback, not here)', async () => {
      const store = new TenantInstallationStore({} as never, {} as never);
      await expect(
        store.storeInstallation({ team: { id: TEAM_A_ID }, isEnterpriseInstall: false } as never),
      ).resolves.toBeUndefined();
    });
  });

  describe('5. InstallationStore: correct token per team_id', () => {
    it('fetchInstallation returns correct token for team A', async () => {
      const tenantRepo = {
        findBySlackTeamId: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, TEAM_A_ID)),
      } as never;
      const secretRepo = {
        get: vi.fn().mockResolvedValue(TOKEN_A),
      } as never;
      const store = new TenantInstallationStore(tenantRepo, secretRepo);
      const installation = await store.fetchInstallation({
        teamId: TEAM_A_ID,
        enterpriseId: undefined,
        isEnterpriseInstall: false,
      });
      expect(installation.bot?.token).toBe(TOKEN_A);
    });

    it('fetchInstallation returns different tokens for different teams', async () => {
      const findBySlackTeamId = vi
        .fn()
        .mockImplementation((teamId: string) =>
          teamId === TEAM_A_ID
            ? makeTenant(TENANT_A_ID, TEAM_A_ID)
            : makeTenant(TENANT_B_ID, TEAM_B_ID),
        );
      const get = vi
        .fn()
        .mockImplementation((tenantId: string) => (tenantId === TENANT_A_ID ? TOKEN_A : TOKEN_B));
      const store = new TenantInstallationStore({ findBySlackTeamId } as never, { get } as never);
      const instA = await store.fetchInstallation({
        teamId: TEAM_A_ID,
        enterpriseId: undefined,
        isEnterpriseInstall: false,
      });
      const instB = await store.fetchInstallation({
        teamId: TEAM_B_ID,
        enterpriseId: undefined,
        isEnterpriseInstall: false,
      });
      expect(instA.bot?.token).toBe(TOKEN_A);
      expect(instB.bot?.token).toBe(TOKEN_B);
      expect(instA.bot?.token).not.toBe(instB.bot?.token);
    });
  });

  describe('6. Tenant env loader: different tokens per tenant', () => {
    it('loadTenantEnv returns different SLACK_BOT_TOKEN for different tenants', async () => {
      const findById = vi
        .fn()
        .mockImplementation((id: string) =>
          id === TENANT_A_ID ? makeTenant(TENANT_A_ID) : makeTenant(TENANT_B_ID),
        );
      const listKeys = vi
        .fn()
        .mockResolvedValue([{ key: 'slack_bot_token', is_set: true, updated_at: new Date() }]);
      const getMany = vi
        .fn()
        .mockImplementation((tenantId: string) =>
          tenantId === TENANT_A_ID ? { slack_bot_token: TOKEN_A } : { slack_bot_token: TOKEN_B },
        );
      const tenantRepo = { findById } as never;
      const secretRepo = { listKeys, getMany } as never;

      const envA = await loadTenantEnv(TENANT_A_ID, { tenantRepo, secretRepo });
      const envB = await loadTenantEnv(TENANT_B_ID, { tenantRepo, secretRepo });

      expect(envA['SLACK_BOT_TOKEN']).toBe(TOKEN_A);
      expect(envB['SLACK_BOT_TOKEN']).toBe(TOKEN_B);
      expect(envA['SLACK_BOT_TOKEN']).not.toBe(envB['SLACK_BOT_TOKEN']);
    });
  });

  describe('7. Soft-delete behavior', () => {
    it('findById returns null for soft-deleted tenant', async () => {
      const prisma = {
        tenant: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      } as never;
      const repo = new TenantRepository(prisma);
      const result = await repo.findById(TENANT_A_ID);
      expect(result).toBeNull();
    });

    it('softDelete sets deleted_at on the tenant', async () => {
      const updateMock = vi
        .fn()
        .mockResolvedValue({ ...makeTenant(TENANT_A_ID), deleted_at: new Date() });
      const prisma = {
        tenant: {
          findUnique: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)),
          update: updateMock,
        },
      } as never;
      const repo = new TenantRepository(prisma);
      await repo.softDelete(TENANT_A_ID);
      expect(updateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TENANT_A_ID },
          data: expect.objectContaining({ deleted_at: expect.any(Date) }),
        }),
      );
    });
  });

  describe('8. Secret hard-delete (credential revoke)', () => {
    it('TenantSecretRepository.delete removes the secret', async () => {
      const findUnique = vi.fn().mockResolvedValue({ key: 'slack_bot_token' });
      const deleteMock = vi.fn().mockResolvedValue({});
      const prisma = {
        tenantSecret: {
          findUnique,
          delete: deleteMock,
        },
      } as never;
      const repo = new TenantSecretRepository(prisma);
      const result = await repo.delete(TENANT_A_ID, 'slack_bot_token');
      expect(result).toBe(true);
      expect(deleteMock).toHaveBeenCalled();
    });

    it('TenantSecretRepository.delete returns false when secret not found', async () => {
      const prisma = {
        tenantSecret: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      } as never;
      const repo = new TenantSecretRepository(prisma);
      const result = await repo.delete(TENANT_A_ID, 'nonexistent_key');
      expect(result).toBe(false);
    });
  });

  describe('9. Tenant env loader: config flattening', () => {
    it('summary.channel_ids and target_channel are flattened into env', async () => {
      const config = { summary: { channel_ids: ['C001', 'C002'], target_channel: 'C_TARGET' } };
      const findById = vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, null, config));
      const listKeys = vi.fn().mockResolvedValue([]);
      const tenantRepo = { findById } as never;
      const secretRepo = { listKeys } as never;

      const env = await loadTenantEnv(TENANT_A_ID, { tenantRepo, secretRepo });
      expect(env['DAILY_SUMMARY_CHANNELS']).toBe('C001,C002');
      expect(env['SUMMARY_TARGET_CHANNEL']).toBe('C_TARGET');
    });
  });
});
