import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockLoadTenantEnv,
  mockCreateSlackClient,
  mockPrismaDisconnect,
  mockTenantRepoCtor,
  mockSecretRepoCtor,
  mockSlackClientInstance,
} = vi.hoisted(() => ({
  mockLoadTenantEnv: vi.fn(),
  mockCreateSlackClient: vi.fn(),
  mockPrismaDisconnect: vi.fn().mockResolvedValue(undefined),
  mockTenantRepoCtor: vi.fn(),
  mockSecretRepoCtor: vi.fn(),
  mockSlackClientInstance: { postMessage: vi.fn(), updateMessage: vi.fn() },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: mockPrismaDisconnect,
  })),
  Prisma: { JsonNull: 'JsonNull' },
}));

vi.mock('../../../../src/repositories/tenant-env-loader.js', () => ({
  loadTenantEnv: mockLoadTenantEnv,
}));

vi.mock('../../../../src/repositories/tenant-repository.js', () => ({
  TenantRepository: mockTenantRepoCtor,
}));

vi.mock('../../../../src/repositories/tenant-secret-repository.js', () => ({
  TenantSecretRepository: mockSecretRepoCtor,
}));

vi.mock('../../../../src/lib/slack-client.js', () => ({
  createSlackClient: mockCreateSlackClient,
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  loadTenantSlack,
  loadTenantEnvFull,
} from '../../../../src/inngest/lifecycle/steps/notify-and-track.js';

const TENANT_ID = '00000000-0000-0000-0000-000000000002';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateSlackClient.mockReturnValue(mockSlackClientInstance);
});

describe('loadTenantSlack — token-present branch', () => {
  it('returns a populated context when SLACK_BOT_TOKEN is set', async () => {
    mockLoadTenantEnv.mockResolvedValue({
      SLACK_BOT_TOKEN: 'xoxb-real',
      NOTIFICATION_CHANNEL: 'C-REAL',
    });

    const ctx = await loadTenantSlack(TENANT_ID, null);

    expect(ctx).not.toBeNull();
    expect(ctx?.botToken).toBe('xoxb-real');
    expect(ctx?.channel).toBe('C-REAL');
    expect(ctx?.tenantEnv).toMatchObject({ SLACK_BOT_TOKEN: 'xoxb-real' });
    expect(ctx?.slackClient).toBe(mockSlackClientInstance);
  });

  it('builds the Slack client with the resolved token and channel', async () => {
    mockLoadTenantEnv.mockResolvedValue({
      SLACK_BOT_TOKEN: 'xoxb-real',
      NOTIFICATION_CHANNEL: 'C-REAL',
    });

    await loadTenantSlack(TENANT_ID, null);

    expect(mockCreateSlackClient).toHaveBeenCalledWith({
      botToken: 'xoxb-real',
      defaultChannel: 'C-REAL',
    });
  });

  it('defaults channel to empty string when NOTIFICATION_CHANNEL is absent', async () => {
    mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-real' });

    const ctx = await loadTenantSlack(TENANT_ID, null);

    expect(ctx?.channel).toBe('');
    expect(mockCreateSlackClient).toHaveBeenCalledWith({
      botToken: 'xoxb-real',
      defaultChannel: '',
    });
  });

  it('forwards the archetype notification channel through to loadTenantEnv', async () => {
    mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-real' });

    await loadTenantSlack(TENANT_ID, 'C-ARCHETYPE');

    expect(mockLoadTenantEnv).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ tenantRepo: expect.anything(), secretRepo: expect.anything() }),
      'C-ARCHETYPE',
    );
  });
});

describe('loadTenantSlack — no-token branch', () => {
  it('returns null when SLACK_BOT_TOKEN is missing', async () => {
    mockLoadTenantEnv.mockResolvedValue({ NOTIFICATION_CHANNEL: 'C-REAL' });

    const ctx = await loadTenantSlack(TENANT_ID, null);

    expect(ctx).toBeNull();
    expect(mockCreateSlackClient).not.toHaveBeenCalled();
  });

  it('returns null when SLACK_BOT_TOKEN is an empty string', async () => {
    mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: '', NOTIFICATION_CHANNEL: 'C-REAL' });

    const ctx = await loadTenantSlack(TENANT_ID, null);

    expect(ctx).toBeNull();
  });
});

describe('loadTenantSlack — prisma lifecycle', () => {
  it('disconnects prisma on the success path', async () => {
    mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-real' });

    await loadTenantSlack(TENANT_ID, null);

    expect(mockPrismaDisconnect).toHaveBeenCalledOnce();
  });

  it('disconnects prisma even when loadTenantEnv throws', async () => {
    mockLoadTenantEnv.mockRejectedValue(new Error('tenant not found'));

    await expect(loadTenantSlack(TENANT_ID, null)).rejects.toThrow('tenant not found');
    expect(mockPrismaDisconnect).toHaveBeenCalledOnce();
  });
});

describe('loadTenantEnvFull', () => {
  it('returns the full env map from loadTenantEnv', async () => {
    const fullEnv = {
      SLACK_BOT_TOKEN: 'xoxb-real',
      NOTIFICATION_CHANNEL: 'C-REAL',
      SUPABASE_URL: 'http://localhost:54331',
    };
    mockLoadTenantEnv.mockResolvedValue(fullEnv);

    const env = await loadTenantEnvFull(TENANT_ID, 'C-CHANNEL');

    expect(env).toEqual(fullEnv);
    expect(mockLoadTenantEnv).toHaveBeenCalledWith(
      TENANT_ID,
      expect.objectContaining({ tenantRepo: expect.anything(), secretRepo: expect.anything() }),
      'C-CHANNEL',
    );
  });

  it('disconnects prisma even when loadTenantEnv throws', async () => {
    mockLoadTenantEnv.mockRejectedValue(new Error('boom'));

    await expect(loadTenantEnvFull(TENANT_ID, null)).rejects.toThrow('boom');
    expect(mockPrismaDisconnect).toHaveBeenCalledOnce();
  });
});
