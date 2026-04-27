import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadTenantEnv } from '../../../src/gateway/services/tenant-env-loader.js';

const TENANT_A_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5';
const TENANT_B_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6';

function makeTenant(id: string, config: unknown = null) {
  return {
    id,
    name: 'Acme',
    slug: 'acme',
    slack_team_id: null,
    config,
    status: 'active',
    created_at: new Date(),
    updated_at: new Date(),
    deleted_at: null,
  };
}

function makeDeps(overrides: {
  findById?: ReturnType<typeof vi.fn>;
  listKeys?: ReturnType<typeof vi.fn>;
  getMany?: ReturnType<typeof vi.fn>;
}) {
  const tenantRepo = {
    findById: overrides.findById ?? vi.fn().mockResolvedValue(null),
  } as never;
  const secretRepo = {
    listKeys: overrides.listKeys ?? vi.fn().mockResolvedValue([]),
    getMany: overrides.getMany ?? vi.fn().mockResolvedValue({}),
  } as never;
  return { tenantRepo, secretRepo };
}

describe('loadTenantEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when tenant is not found', async () => {
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(null) });
    await expect(loadTenantEnv(TENANT_A_ID, deps)).rejects.toThrow(
      `Tenant not found: ${TENANT_A_ID}`,
    );
  });

  it('includes whitelisted platform env vars', async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'debug';
    process.env.SOME_RANDOM_KEY = 'should-not-appear';
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['NODE_ENV']).toBe('test');
    expect(env['LOG_LEVEL']).toBe('debug');
    expect(env['SOME_RANDOM_KEY']).toBeUndefined();
  });

  it('does not include non-whitelisted env vars (whitelist enforced)', async () => {
    process.env.SECRET_INTERNAL_KEY = 'super-secret';
    process.env.AWS_ACCESS_KEY_ID = 'AKIA123';
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['SECRET_INTERNAL_KEY']).toBeUndefined();
    expect(env['AWS_ACCESS_KEY_ID']).toBeUndefined();
  });

  it('uppercases secret keys in output', async () => {
    const deps = makeDeps({
      findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)),
      listKeys: vi.fn().mockResolvedValue([
        { key: 'slack_bot_token', is_set: true, updated_at: new Date() },
        { key: 'github_token', is_set: true, updated_at: new Date() },
      ]),
      getMany: vi.fn().mockResolvedValue({
        slack_bot_token: 'xoxb-abc',
        github_token: 'ghp-xyz',
      }),
    });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['SLACK_BOT_TOKEN']).toBe('xoxb-abc');
    expect(env['GITHUB_TOKEN']).toBe('ghp-xyz');
    expect(env['slack_bot_token']).toBeUndefined();
    expect(env['github_token']).toBeUndefined();
  });

  it('maps config.summary.channel_ids to DAILY_SUMMARY_CHANNELS (comma-joined)', async () => {
    const config = { summary: { channel_ids: ['C001', 'C002', 'C003'] } };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['DAILY_SUMMARY_CHANNELS']).toBe('C001,C002,C003');
  });

  it('maps config.summary.target_channel to SUMMARY_TARGET_CHANNEL', async () => {
    const config = { summary: { target_channel: 'C_TARGET' } };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['SUMMARY_TARGET_CHANNEL']).toBe('C_TARGET');
  });

  it('omits DAILY_SUMMARY_CHANNELS when channel_ids is empty', async () => {
    const config = { summary: { channel_ids: [] } };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['DAILY_SUMMARY_CHANNELS']).toBeUndefined();
  });

  it('omits SUMMARY_TARGET_CHANNEL when target_channel is absent', async () => {
    const config = { summary: { channel_ids: ['C001'] } };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['SUMMARY_TARGET_CHANNEL']).toBeUndefined();
  });

  it('two tenants produce different env maps (isolation)', async () => {
    const configA = { summary: { channel_ids: ['CA1'], target_channel: 'CA_TARGET' } };
    const configB = { summary: { channel_ids: ['CB1', 'CB2'], target_channel: 'CB_TARGET' } };

    const findById = vi
      .fn()
      .mockImplementation((id: string) =>
        id === TENANT_A_ID ? makeTenant(TENANT_A_ID, configA) : makeTenant(TENANT_B_ID, configB),
      );
    const listKeys = vi
      .fn()
      .mockImplementation((tenantId: string) =>
        tenantId === TENANT_A_ID
          ? [{ key: 'slack_bot_token', is_set: true, updated_at: new Date() }]
          : [{ key: 'slack_bot_token', is_set: true, updated_at: new Date() }],
      );
    const getMany = vi
      .fn()
      .mockImplementation((tenantId: string) =>
        tenantId === TENANT_A_ID
          ? { slack_bot_token: 'xoxb-tenant-a' }
          : { slack_bot_token: 'xoxb-tenant-b' },
      );

    const depsA = makeDeps({ findById, listKeys, getMany });
    const depsB = makeDeps({ findById, listKeys, getMany });

    const envA = await loadTenantEnv(TENANT_A_ID, depsA);
    const envB = await loadTenantEnv(TENANT_B_ID, depsB);

    expect(envA['SLACK_BOT_TOKEN']).toBe('xoxb-tenant-a');
    expect(envB['SLACK_BOT_TOKEN']).toBe('xoxb-tenant-b');
    expect(envA['DAILY_SUMMARY_CHANNELS']).toBe('CA1');
    expect(envB['DAILY_SUMMARY_CHANNELS']).toBe('CB1,CB2');
    expect(envA['SUMMARY_TARGET_CHANNEL']).toBe('CA_TARGET');
    expect(envB['SUMMARY_TARGET_CHANNEL']).toBe('CB_TARGET');
    expect(envA['SLACK_BOT_TOKEN']).not.toBe(envB['SLACK_BOT_TOKEN']);
  });

  it('skips secrets fetch when no secrets exist for tenant', async () => {
    const getMany = vi.fn();
    const deps = makeDeps({
      findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)),
      listKeys: vi.fn().mockResolvedValue([]),
      getMany,
    });
    await loadTenantEnv(TENANT_A_ID, deps);
    expect(getMany).not.toHaveBeenCalled();
  });

  it('injects NOTIFICATION_CHANNEL from config.notification_channel (tenant-level)', async () => {
    const config = { notification_channel: 'C_TENANT_NOTIFY' };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['NOTIFICATION_CHANNEL']).toBe('C_TENANT_NOTIFY');
  });

  it('injects NOTIFICATION_CHANNEL from archetype param (3rd arg to loadTenantEnv)', async () => {
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps, 'C_ARCHETYPE_NOTIFY');
    expect(env['NOTIFICATION_CHANNEL']).toBe('C_ARCHETYPE_NOTIFY');
  });

  it('archetype param overrides tenant config for NOTIFICATION_CHANNEL', async () => {
    const config = { notification_channel: 'C_TENANT_NOTIFY' };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps, 'C_ARCHETYPE_NOTIFY');
    expect(env['NOTIFICATION_CHANNEL']).toBe('C_ARCHETYPE_NOTIFY');
  });

  it('NOTIFICATION_CHANNEL absent when neither tenant config nor archetype has it', async () => {
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['NOTIFICATION_CHANNEL']).toBeUndefined();
  });

  it('injects SOURCE_CHANNELS from config.source_channels', async () => {
    const config = { source_channels: ['C001', 'C002'] };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['SOURCE_CHANNELS']).toBe('C001,C002');
  });

  it('DAILY_SUMMARY_CHANNELS is injected as backward-compat alias (same value as SOURCE_CHANNELS)', async () => {
    const config = { source_channels: ['C001', 'C002'] };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['DAILY_SUMMARY_CHANNELS']).toBe('C001,C002');
    expect(env['DAILY_SUMMARY_CHANNELS']).toBe(env['SOURCE_CHANNELS']);
  });

  it('falls back to summary.channel_ids when source_channels absent (backward compat)', async () => {
    const config = { summary: { channel_ids: ['C_LEGACY1', 'C_LEGACY2'] } };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['SOURCE_CHANNELS']).toBe('C_LEGACY1,C_LEGACY2');
    expect(env['DAILY_SUMMARY_CHANNELS']).toBe('C_LEGACY1,C_LEGACY2');
  });

  it('SOURCE_CHANNELS absent when both source_channels and summary.channel_ids are absent', async () => {
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['SOURCE_CHANNELS']).toBeUndefined();
  });

  it('SUMMARY_PUBLISH_CHANNEL is NOT present in env output (removed)', async () => {
    const config = {
      summary: {
        channel_ids: ['C001'],
        target_channel: 'C_TARGET',
        publish_channel: 'C_PUBLISH',
      },
    };
    const deps = makeDeps({ findById: vi.fn().mockResolvedValue(makeTenant(TENANT_A_ID, config)) });
    const env = await loadTenantEnv(TENANT_A_ID, deps);
    expect(env['SUMMARY_PUBLISH_CHANNEL']).toBeUndefined();
  });
});
