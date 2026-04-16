import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TenantInstallationStore } from '../../../src/gateway/slack/installation-store.js';

const TENANT_A_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const TEAM_A_ID = 'T_TEAM_A';
const TEAM_B_ID = 'T_TEAM_B';
const TOKEN_A = 'xoxb-token-a';
const TOKEN_B = 'xoxb-token-b';

function makeTenant(id: string, teamId: string) {
  return {
    id,
    name: 'Acme',
    slug: 'acme',
    slack_team_id: teamId,
    config: null,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };
}

function makeStore(overrides: {
  findBySlackTeamId?: ReturnType<typeof vi.fn>;
  get?: ReturnType<typeof vi.fn>;
  delete?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}) {
  process.env.ENCRYPTION_KEY = 'a'.repeat(64);
  const tenantRepo = {
    findBySlackTeamId: overrides.findBySlackTeamId ?? vi.fn(),
    update: overrides.update ?? vi.fn(),
  } as never;
  const secretRepo = {
    get: overrides.get ?? vi.fn(),
    delete: overrides.delete ?? vi.fn(),
  } as never;
  return new TenantInstallationStore(tenantRepo, secretRepo);
}

describe('TenantInstallationStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('storeInstallation', () => {
    it('is a no-op (does not throw)', async () => {
      const store = makeStore({});
      await expect(
        store.storeInstallation({ team: { id: TEAM_A_ID }, isEnterpriseInstall: false } as never),
      ).resolves.toBeUndefined();
    });
  });

  describe('fetchInstallation', () => {
    it('throws when teamId is missing', async () => {
      const store = makeStore({});
      await expect(
        store.fetchInstallation({
          teamId: undefined,
          enterpriseId: 'E1',
          isEnterpriseInstall: true,
        }),
      ).rejects.toThrow('No installation for team');
    });

    it('throws when no tenant found for teamId', async () => {
      const store = makeStore({
        findBySlackTeamId: vi.fn().mockResolvedValue(null),
      });
      await expect(
        store.fetchInstallation({
          teamId: 'T_UNKNOWN',
          enterpriseId: undefined,
          isEnterpriseInstall: false,
        }),
      ).rejects.toThrow('No installation for team: T_UNKNOWN');
    });

    it('throws when bot token not found for tenant', async () => {
      const store = makeStore({
        findBySlackTeamId: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, TEAM_A_ID)),
        get: vi.fn().mockResolvedValue(null),
      });
      await expect(
        store.fetchInstallation({
          teamId: TEAM_A_ID,
          enterpriseId: undefined,
          isEnterpriseInstall: false,
        }),
      ).rejects.toThrow('No bot token found for team');
    });

    it('returns installation with correct bot token for known team', async () => {
      const store = makeStore({
        findBySlackTeamId: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, TEAM_A_ID)),
        get: vi.fn().mockResolvedValue(TOKEN_A),
      });
      const installation = await store.fetchInstallation({
        teamId: TEAM_A_ID,
        enterpriseId: undefined,
        isEnterpriseInstall: false,
      });
      expect(installation.bot?.token).toBe(TOKEN_A);
      expect(installation.team?.id).toBe(TEAM_A_ID);
    });

    it('returns different tokens for different teams (cross-tenant isolation)', async () => {
      const TENANT_B_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';
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
      const store = makeStore({ findBySlackTeamId, get });
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

  describe('deleteInstallation', () => {
    it('does nothing when teamId is missing', async () => {
      const findBySlackTeamId = vi.fn();
      const store = makeStore({ findBySlackTeamId });
      await store.deleteInstallation({
        teamId: undefined,
        enterpriseId: 'E1',
        isEnterpriseInstall: true,
      });
      expect(findBySlackTeamId).not.toHaveBeenCalled();
    });

    it('does nothing when tenant not found', async () => {
      const deleteSecret = vi.fn();
      const store = makeStore({
        findBySlackTeamId: vi.fn().mockResolvedValue(null),
        delete: deleteSecret,
      });
      await store.deleteInstallation({
        teamId: 'T_GONE',
        enterpriseId: undefined,
        isEnterpriseInstall: false,
      });
      expect(deleteSecret).not.toHaveBeenCalled();
    });

    it('deletes bot token and clears slack_team_id', async () => {
      const deleteSecret = vi.fn().mockResolvedValue(true);
      const update = vi.fn().mockResolvedValue({});
      const store = makeStore({
        findBySlackTeamId: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, TEAM_A_ID)),
        delete: deleteSecret,
        update,
      });
      await store.deleteInstallation({
        teamId: TEAM_A_ID,
        enterpriseId: undefined,
        isEnterpriseInstall: false,
      });
      expect(deleteSecret).toHaveBeenCalledWith(TENANT_A_ID, 'slack_bot_token');
      expect(update).toHaveBeenCalledWith(TENANT_A_ID, { slack_team_id: null });
    });
  });
});
