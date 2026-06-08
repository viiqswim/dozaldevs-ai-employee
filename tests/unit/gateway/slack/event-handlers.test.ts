import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from '@slack/bolt';
import type { InngestLike } from '../../../../src/gateway/types.js';
import {
  registerSlackHandlers,
  _clearPendingInputCollections,
  _clearRecentMentions,
} from '../../../../src/gateway/slack/handlers.js';
import {
  pendingInputCollections,
  type PendingInputCollection,
} from '../../../../src/gateway/slack/handlers/shared.js';

// shared.ts holds a module-level `new PrismaClient()` (used by findTaskIdByThreadTs).
// Mocking the constructor makes both that singleton and the injected param below
// resolve to the same controllable instance.
const { mockPrismaInstance, mockResolveArchetypeFromChannel } = vi.hoisted(() => ({
  mockPrismaInstance: {
    deliverable: { findFirst: vi.fn() },
    task: { findFirst: vi.fn() },
    tenantIntegration: { findFirst: vi.fn() },
    employeeRule: { update: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  },
  mockResolveArchetypeFromChannel: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrismaInstance),
}));

vi.mock('../../../../src/lib/interaction-classifier.js', () => ({
  resolveArchetypeFromChannel: mockResolveArchetypeFromChannel,
}));

type EventHandler = (args: { event: unknown; client?: unknown }) => Promise<void>;

function makeMockBoltApp() {
  const eventHandlers = new Map<string, EventHandler>();
  const boltApp = {
    use: vi.fn(),
    action: vi.fn(),
    view: vi.fn(),
    event: vi.fn((name: string, handler: EventHandler) => {
      eventHandlers.set(name, handler);
    }),
    _getEvent: (name: string) => eventHandlers.get(name) as EventHandler,
  };
  return boltApp;
}

function makeMockInngest(): InngestLike & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue({ ids: ['mock-id'] }) };
}

function makeClient() {
  return {
    chat: {
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ack.000001' }),
      update: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
}

function makePending(overrides: Partial<PendingInputCollection> = {}): PendingInputCollection {
  return {
    archetypeId: 'arch-1',
    tenantId: 'tenant-1',
    userId: 'U-PENDING',
    channelId: 'C-PENDING',
    text: 'run the report',
    roleName: 'Reporter',
    requiredInputs: [{ key: 'date', label: 'Date' }],
    ...overrides,
  };
}

function register() {
  const boltApp = makeMockBoltApp();
  const inngest = makeMockInngest();
  registerSlackHandlers(boltApp as unknown as App, inngest, mockPrismaInstance as never);
  return { boltApp, inngest };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearPendingInputCollections();
  _clearRecentMentions();
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';

  // Defaults: no deliverable, no task, no integration.  mockPrismaInstance.deliverable.findFirst.mockResolvedValue(null);
  mockPrismaInstance.task.findFirst.mockResolvedValue(null);
  mockPrismaInstance.tenantIntegration.findFirst.mockResolvedValue(null);
  mockResolveArchetypeFromChannel.mockResolvedValue({ archetype: null, isExactMatch: false });
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
});

describe('message event handler — thread-reply collection', () => {
  it('pending input collection for thread → sends trigger.input-received and clears the map', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('message');
    expect(handler).toBeDefined();

    pendingInputCollections.set('thr.parent', makePending({ tenantId: 'tenant-xyz' }));

    await handler({
      event: {
        thread_ts: 'thr.parent',
        ts: 'thr.reply',
        text: 'June 5th',
        user: 'U-REPLY',
        channel: 'C-CHAN',
      },
    });

    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/trigger.input-received',
        data: expect.objectContaining({
          threadTs: 'thr.parent',
          text: 'June 5th',
          tenantId: 'tenant-xyz',
        }),
      }),
    );
    expect(pendingInputCollections.has('thr.parent')).toBe(false);
  });

  it('no pending but matching task found → sends interaction.received with source thread_reply', async () => {
    mockPrismaInstance.task.findFirst.mockResolvedValue({ id: 'task-42' });

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('message');

    await handler({
      event: {
        thread_ts: 'thr.with-task',
        ts: 'thr.reply2',
        text: 'looks good',
        user: 'U-REPLY2',
        channel: 'C-CHAN2',
      },
    });

    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/interaction.received',
        data: expect.objectContaining({
          source: 'thread_reply',
          text: 'looks good',
          userId: 'U-REPLY2',
          taskId: 'task-42',
        }),
      }),
    );
  });

  it('no pending and no matching task → no event sent', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('message');

    await handler({
      event: {
        thread_ts: 'thr.orphan',
        ts: 'thr.reply3',
        text: 'hello?',
        user: 'U-REPLY3',
        channel: 'C-CHAN3',
      },
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('top-level message (no thread_ts) → ignored', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('message');

    await handler({
      event: { ts: 'top.001', text: 'top-level', user: 'U1', channel: 'C1' },
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('thread parent message (thread_ts === ts) → ignored', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('message');

    await handler({
      event: { thread_ts: 'same.001', ts: 'same.001', text: 'parent', user: 'U1', channel: 'C1' },
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('bot message (bot_id present) → ignored', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('message');

    await handler({
      event: {
        thread_ts: 'thr.bot',
        ts: 'thr.botreply',
        text: 'I am a bot',
        user: 'U-BOT',
        bot_id: 'B123',
        channel: 'C1',
      },
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('message with no text → ignored', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('message');

    await handler({
      event: { thread_ts: 'thr.notext', ts: 'thr.r', user: 'U1', channel: 'C1' },
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('inngest.send rejection does not throw out of the handler', async () => {
    mockPrismaInstance.task.findFirst.mockResolvedValue({ id: 'task-err' });

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    inngest.send.mockRejectedValueOnce(new Error('inngest down'));
    registerSlackHandlers(boltApp as unknown as App, inngest, mockPrismaInstance as never);

    const handler = boltApp._getEvent('message');

    await expect(
      handler({
        event: {
          thread_ts: 'thr.err',
          ts: 'thr.errreply',
          text: 'boom',
          user: 'U-ERR',
          channel: 'C-ERR',
        },
      }),
    ).resolves.not.toThrow();
  });
});

describe('app_mention event handler — routing', () => {
  function mention(
    overrides: Partial<{
      ts: string;
      channel: string;
      user: string;
      text: string;
      team: string;
      bot_id: string | undefined;
      thread_ts: string | undefined;
    }> = {},
  ) {
    return {
      ts: overrides.ts ?? 'm.001',
      channel: overrides.channel ?? 'C-MENTION',
      user: overrides.user ?? 'U-MENTION',
      text: overrides.text ?? '<@UBOT> please run the report',
      team: 'team' in overrides ? overrides.team : 'T-TEAM',
      bot_id: overrides.bot_id,
      thread_ts: overrides.thread_ts,
    };
  }

  it('tenant resolved + archetype assigned → posts ack and sends interaction.received (source mention)', async () => {
    mockPrismaInstance.tenantIntegration.findFirst.mockResolvedValue({ tenant_id: 'tenant-1' });
    mockResolveArchetypeFromChannel.mockResolvedValue({
      archetype: { id: 'arch-1', role_name: 'Reporter', notification_channel: 'C-MENTION' },
      isExactMatch: true,
    });

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');
    expect(handler).toBeDefined();

    const client = makeClient();
    await handler({ event: mention(), client });

    expect(client.chat.postMessage).toHaveBeenCalledTimes(1);

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const sent = inngest.send.mock.calls[0][0] as { name: string; data: Record<string, unknown> };
    expect(sent.name).toBe('employee/interaction.received');
    expect(sent.data.source).toBe('mention');
    expect(sent.data.tenantId).toBe('tenant-1');
    expect(sent.data.team).toBe('T-TEAM');
    expect(sent.data.text).toBe('please run the report');
  });

  it('tenant resolved but NO archetype assigned → declines via chat.update, no interaction.received', async () => {
    mockPrismaInstance.tenantIntegration.findFirst.mockResolvedValue({ tenant_id: 'tenant-1' });
    mockResolveArchetypeFromChannel.mockResolvedValue({ archetype: null, isExactMatch: false });

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');

    const client = makeClient();
    await handler({ event: mention({ channel: 'C-UNASSIGNED' }), client });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(client.chat.update).toHaveBeenCalledTimes(1);
    const updateArgs = client.chat.update.mock.calls[0][0] as { text: string };
    expect(updateArgs.text).toContain("don't have any employees");
  });

  it('bot-authored mention (bot_id present) → ignored entirely', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');

    const client = makeClient();
    await handler({ event: mention({ bot_id: 'B999' }), client });

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('DM channel (starts with D) → ignored', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');

    const client = makeClient();
    await handler({ event: mention({ channel: 'D-DIRECT' }), client });

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('@mention inside thread with pending input → sends trigger.input-received, no ack/interaction', async () => {
    pendingInputCollections.set('thr.collect', makePending({ tenantId: 'tenant-collect' }));

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');

    const client = makeClient();
    await handler({
      event: mention({ ts: 'thr.mentionreply', thread_ts: 'thr.collect' }),
      client,
    });

    expect(client.chat.postMessage).not.toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/trigger.input-received',
        data: expect.objectContaining({ threadTs: 'thr.collect', tenantId: 'tenant-collect' }),
      }),
    );
    expect(pendingInputCollections.has('thr.collect')).toBe(false);
  });

  it('no team on event → tenant unresolved, forwards interaction.received with tenantId null', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');

    const client = makeClient();
    await handler({ event: mention({ team: undefined }), client });

    expect(mockPrismaInstance.tenantIntegration.findFirst).not.toHaveBeenCalled();
    expect(mockResolveArchetypeFromChannel).not.toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledTimes(1);
    const sent = inngest.send.mock.calls[0][0] as { name: string; data: Record<string, unknown> };
    expect(sent.name).toBe('employee/interaction.received');
    expect(sent.data.tenantId).toBeNull();
  });

  it('ack postMessage failure does not abort routing (still sends interaction.received)', async () => {
    mockPrismaInstance.tenantIntegration.findFirst.mockResolvedValue({ tenant_id: 'tenant-1' });
    mockResolveArchetypeFromChannel.mockResolvedValue({
      archetype: { id: 'arch-1', role_name: 'Reporter', notification_channel: 'C-MENTION' },
      isExactMatch: true,
    });

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');

    const client = makeClient();
    client.chat.postMessage.mockRejectedValueOnce(new Error('rate_limited'));

    await expect(handler({ event: mention(), client })).resolves.not.toThrow();
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });
});
