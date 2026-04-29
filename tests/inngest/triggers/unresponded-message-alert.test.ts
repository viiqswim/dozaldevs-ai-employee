import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGetStaleApprovals = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockMarkReminderSent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockShouldSendReminder = vi.hoisted(() => vi.fn().mockReturnValue(true));
const mockBuildReminderBlocks = vi.hoisted(() => vi.fn().mockReturnValue([{ type: 'header' }]));
const mockDecrypt = vi.hoisted(() => vi.fn().mockReturnValue('xoxb-test-token'));
const mockPostMessage = vi.hoisted(() => vi.fn().mockResolvedValue({ ts: '123', channel: 'C123' }));
const mockCreateSlackClient = vi.hoisted(() =>
  vi.fn().mockReturnValue({ postMessage: mockPostMessage }),
);

vi.mock('../../../src/inngest/lib/pending-approvals.js', () => ({
  getStaleApprovals: mockGetStaleApprovals,
  markReminderSent: mockMarkReminderSent,
}));
vi.mock('../../../src/inngest/lib/quiet-hours.js', () => ({
  shouldSendReminder: mockShouldSendReminder,
  DEFAULT_QUIET_HOURS: { start: 1, end: 8, timezone: 'America/Chicago' },
}));
vi.mock('../../../src/inngest/lib/reminder-blocks.js', () => ({
  buildReminderBlocks: mockBuildReminderBlocks,
}));
vi.mock('../../../src/lib/encryption.js', () => ({
  decrypt: mockDecrypt,
}));
vi.mock('../../../src/lib/slack-client.js', () => ({
  createSlackClient: mockCreateSlackClient,
}));

import { createUnrespondedMessageAlertTrigger } from '../../../src/inngest/triggers/unresponded-message-alert.js';

function makeMockStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
}

function makeMockInngest() {
  return {
    createFunction: vi.fn().mockReturnValue({}),
  };
}

function makeMockFetch(
  archetypesData: unknown[],
  tenantsData: unknown[],
  secretsData: unknown[] = [{ ciphertext: 'abc', iv: 'def', auth_tag: 'ghi' }],
) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/archetypes?')) {
      return Promise.resolve({ json: () => Promise.resolve(archetypesData) });
    }
    if (url.includes('/tenants?')) {
      return Promise.resolve({ json: () => Promise.resolve(tenantsData) });
    }
    if (url.includes('/tenant_secrets?')) {
      return Promise.resolve({ json: () => Promise.resolve(secretsData) });
    }
    return Promise.resolve({ json: () => Promise.resolve([]) });
  });
}

const STALE_APPROVAL = {
  id: 'approval-1',
  tenantId: 'tenant-1',
  threadUid: 'thread-uid-1',
  taskId: 'task-1',
  slackTs: '1234567890.123456',
  channelId: 'C456',
  createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
  guestName: 'John Doe',
  propertyName: 'Beach House',
  urgency: false,
};

const ARCHETYPE_WITH_CHANNEL = {
  id: 'arch-1',
  tenant_id: 'tenant-1',
  notification_channel: 'C123',
};

const TENANT_CONFIG = {
  id: 'tenant-1',
  config: { guest_messaging: { alert_threshold_minutes: 30 } },
};

describe('createUnrespondedMessageAlertTrigger', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://test';
    process.env.SUPABASE_SECRET_KEY = 'test-key';
    mockGetStaleApprovals.mockClear();
    mockMarkReminderSent.mockClear();
    mockShouldSendReminder.mockClear();
    mockBuildReminderBlocks.mockClear();
    mockDecrypt.mockClear();
    mockPostMessage.mockClear();
    mockCreateSlackClient.mockClear();
    mockGetStaleApprovals.mockResolvedValue([]);
    mockShouldSendReminder.mockReturnValue(true);
    mockBuildReminderBlocks.mockReturnValue([{ type: 'header' }]);
    mockDecrypt.mockReturnValue('xoxb-test-token');
    mockPostMessage.mockResolvedValue({ ts: '123', channel: 'C123' });
    mockCreateSlackClient.mockReturnValue({ postMessage: mockPostMessage });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a function with id trigger/unresponded-message-alerter', () => {
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({ id: 'trigger/unresponded-message-alerter' }),
    };
    createUnrespondedMessageAlertTrigger(mockInngest as never);
    expect(mockInngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'trigger/unresponded-message-alerter' }),
      expect.anything(),
    );
  });

  it('uses cron */5 * * * *', () => {
    const mockInngest = makeMockInngest();
    createUnrespondedMessageAlertTrigger(mockInngest as never);
    const [config] = mockInngest.createFunction.mock.calls[0] as [
      { triggers: Array<{ cron: string }> },
    ];
    expect(config.triggers[0].cron).toBe('*/5 * * * *');
  });

  it('no archetypes → returns early, getStaleApprovals NOT called', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal('fetch', makeMockFetch([], []));

    createUnrespondedMessageAlertTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockGetStaleApprovals).not.toHaveBeenCalled();
  });

  it('no stale approvals → returns early, Slack postMessage NOT called', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal('fetch', makeMockFetch([ARCHETYPE_WITH_CHANNEL], [TENANT_CONFIG]));
    mockGetStaleApprovals.mockResolvedValue([]);

    createUnrespondedMessageAlertTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('non-urgent approval during quiet hours → shouldSendReminder returns false → no Slack post', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal('fetch', makeMockFetch([ARCHETYPE_WITH_CHANNEL], [TENANT_CONFIG]));
    mockGetStaleApprovals.mockResolvedValue([{ ...STALE_APPROVAL, urgency: false }]);
    mockShouldSendReminder.mockReturnValue(false);

    createUnrespondedMessageAlertTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('urgent approval during quiet hours → shouldSendReminder returns true → Slack post sent', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal('fetch', makeMockFetch([ARCHETYPE_WITH_CHANNEL], [TENANT_CONFIG]));
    mockGetStaleApprovals.mockResolvedValue([{ ...STALE_APPROVAL, urgency: true }]);
    mockShouldSendReminder.mockReturnValue(true);

    createUnrespondedMessageAlertTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockPostMessage).toHaveBeenCalledOnce();
  });

  it('stale approvals outside quiet hours → postMessage called with correct channel and blocks', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal('fetch', makeMockFetch([ARCHETYPE_WITH_CHANNEL], [TENANT_CONFIG]));
    mockGetStaleApprovals.mockResolvedValue([STALE_APPROVAL]);
    mockShouldSendReminder.mockReturnValue(true);
    const mockBlocks = [{ type: 'header' }, { type: 'section' }];
    mockBuildReminderBlocks.mockReturnValue(mockBlocks);

    createUnrespondedMessageAlertTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C123',
        blocks: mockBlocks,
      }),
    );
  });

  it('markReminderSent called with correct IDs after successful post', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal('fetch', makeMockFetch([ARCHETYPE_WITH_CHANNEL], [TENANT_CONFIG]));
    mockGetStaleApprovals.mockResolvedValue([STALE_APPROVAL]);
    mockShouldSendReminder.mockReturnValue(true);

    createUnrespondedMessageAlertTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockMarkReminderSent).toHaveBeenCalledWith('http://test', 'test-key', ['approval-1']);
  });

  it('missing alert_threshold_minutes → defaults to 30', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    const tenantConfigNoThreshold = {
      id: 'tenant-1',
      config: { guest_messaging: {} },
    };
    vi.stubGlobal('fetch', makeMockFetch([ARCHETYPE_WITH_CHANNEL], [tenantConfigNoThreshold]));
    mockGetStaleApprovals.mockResolvedValue([]);

    createUnrespondedMessageAlertTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockGetStaleApprovals).toHaveBeenCalledWith('http://test', 'test-key', 'tenant-1', 30);
  });

  it('missing quiet_hours config → defaults to {start:1, end:8, timezone:"America/Chicago"}', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    const tenantConfigNoQuietHours = {
      id: 'tenant-1',
      config: { guest_messaging: { alert_threshold_minutes: 30 } },
    };
    vi.stubGlobal('fetch', makeMockFetch([ARCHETYPE_WITH_CHANNEL], [tenantConfigNoQuietHours]));
    mockGetStaleApprovals.mockResolvedValue([STALE_APPROVAL]);
    mockShouldSendReminder.mockReturnValue(true);

    createUnrespondedMessageAlertTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockShouldSendReminder).toHaveBeenCalledWith(
      expect.any(Number),
      { start: 1, end: 8, timezone: 'America/Chicago' },
      expect.any(Boolean),
    );
  });
});
