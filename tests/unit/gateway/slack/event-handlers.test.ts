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
const {
  mockPrismaInstance,
  mockResolveArchetypeFromChannel,
  mockResolveEmployeesAcrossTenants,
  mockRouteToEmployee,
} = vi.hoisted(() => ({
  mockPrismaInstance: {
    deliverable: { findFirst: vi.fn() },
    task: { findFirst: vi.fn() },
    tenantIntegration: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    tenantSecret: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    employeeRule: { update: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
  },
  mockResolveArchetypeFromChannel: vi.fn(),
  mockResolveEmployeesAcrossTenants: vi.fn(),
  mockRouteToEmployee: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrismaInstance),
}));

vi.mock('../../../../src/lib/interaction-classifier.js', () => ({
  resolveArchetypeFromChannel: mockResolveArchetypeFromChannel,
  resolveEmployeesAcrossTenants: mockResolveEmployeesAcrossTenants,
}));

vi.mock('../../../../src/inngest/slack-trigger-handler.js', () => ({
  routeToEmployee: mockRouteToEmployee,
  prettifyRoleName: (name: string) =>
    name
      .split('-')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
}));

type EventHandler = (args: { event: unknown; client?: unknown; body?: unknown }) => Promise<void>;

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

  // Defaults: no deliverable, no task, no integration.
  mockPrismaInstance.task.findFirst.mockResolvedValue(null);
  mockPrismaInstance.tenantIntegration.findFirst.mockResolvedValue(null);
  mockPrismaInstance.tenantIntegration.findMany.mockResolvedValue([]);
  mockResolveArchetypeFromChannel.mockResolvedValue({ archetype: null, isExactMatch: false });
  mockResolveEmployeesAcrossTenants.mockResolvedValue([]);
  mockRouteToEmployee.mockResolvedValue(null);
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

  it('single-owner channel: one candidate → posts ack and sends interaction.received with that tenantId', async () => {
    mockPrismaInstance.tenantIntegration.findMany.mockResolvedValue([{ tenant_id: 'tenant-1' }]);
    mockResolveEmployeesAcrossTenants.mockResolvedValue([
      {
        archetype: { id: 'arch-1', role_name: 'Reporter', notification_channel: 'C-MENTION' },
        tenantId: 'tenant-1',
      },
    ]);

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

  it('two-owner channel, confident LLM → picks winner; winner tenantId in dispatched event', async () => {
    mockPrismaInstance.tenantIntegration.findMany.mockResolvedValue([
      { tenant_id: 'tenant-A' },
      { tenant_id: 'tenant-B' },
    ]);
    const candidateA = {
      archetype: { id: 'arch-a', role_name: 'reporter-bot', notification_channel: 'C-MENTION' },
      tenantId: 'tenant-A',
    };
    const candidateB = {
      archetype: {
        id: 'arch-b',
        role_name: 'summarizer-bot',
        notification_channel: 'C-MENTION',
      },
      tenantId: 'tenant-B',
    };
    mockResolveEmployeesAcrossTenants.mockResolvedValue([candidateA, candidateB]);
    mockRouteToEmployee.mockResolvedValue({ archetype: candidateB.archetype, confidence: 90 });

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');
    const client = makeClient();
    await handler({ event: mention(), client });

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const sent = inngest.send.mock.calls[0][0] as { name: string; data: Record<string, unknown> };
    expect(sent.name).toBe('employee/interaction.received');
    expect(sent.data.tenantId).toBe('tenant-B');
    expect(sent.data.source).toBe('mention');
  });

  it('ambiguous (LLM not confident) → disambiguation card posted with candidate buttons; ZERO interaction.received', async () => {
    mockPrismaInstance.tenantIntegration.findMany.mockResolvedValue([
      { tenant_id: 'tenant-A' },
      { tenant_id: 'tenant-B' },
    ]);
    const candidateA = {
      archetype: { id: 'arch-a', role_name: 'reporter-bot', notification_channel: 'C-MENTION' },
      tenantId: 'tenant-A',
    };
    const candidateB = {
      archetype: {
        id: 'arch-b',
        role_name: 'summarizer-bot',
        notification_channel: 'C-MENTION',
      },
      tenantId: 'tenant-B',
    };
    mockResolveEmployeesAcrossTenants.mockResolvedValue([candidateA, candidateB]);
    mockRouteToEmployee.mockResolvedValue(null);

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');
    const client = makeClient();
    await handler({ event: mention(), client });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(client.chat.update).toHaveBeenCalledTimes(1);
    const updateCall = client.chat.update.mock.calls[0][0] as {
      blocks?: Array<{ type: string; elements?: unknown[] }>;
      text: string;
    };
    const actionsBlock = updateCall.blocks?.find((b) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    expect(Array.isArray(actionsBlock?.elements)).toBe(true);
    const elements = actionsBlock?.elements as Array<{
      action_id: string;
      value: string;
      type: string;
    }>;
    expect(elements.length).toBeGreaterThanOrEqual(2);
    // Each button must have a UNIQUE action_id (Slack rejects duplicate action_ids
    // within one message with invalid_blocks). Index suffix guarantees uniqueness.
    expect(elements[0].action_id).toBe('trigger_disambiguate_0');
    expect(elements[1].action_id).toBe('trigger_disambiguate_1');
    const actionIds = elements.map((el) => el.action_id);
    expect(new Set(actionIds).size).toBe(actionIds.length);
    const valA = JSON.parse(elements[0].value) as { archetypeId: string; tenantId: string };
    const valB = JSON.parse(elements[1].value) as { archetypeId: string; tenantId: string };
    const tenantIds = [valA.tenantId, valB.tenantId];
    expect(tenantIds).toContain('tenant-A');
    expect(tenantIds).toContain('tenant-B');
  });

  it('zero candidates on workspace → "no employees" message; no interaction.received', async () => {
    mockPrismaInstance.tenantIntegration.findMany.mockResolvedValue([{ tenant_id: 'tenant-1' }]);
    mockResolveEmployeesAcrossTenants.mockResolvedValue([]);

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');
    const client = makeClient();
    await handler({ event: mention({ channel: 'C-EMPTY' }), client });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(client.chat.update).toHaveBeenCalledTimes(1);
    const updateArgs = client.chat.update.mock.calls[0][0] as { text: string };
    expect(updateArgs.text).toContain("don't have any employees");
  });

  it('tenant with zero active employees contributes no candidates (no crash)', async () => {
    mockPrismaInstance.tenantIntegration.findMany.mockResolvedValue([
      { tenant_id: 'tenant-A' },
      { tenant_id: 'tenant-B' },
    ]);
    mockResolveEmployeesAcrossTenants.mockResolvedValue([
      {
        archetype: { id: 'arch-a', role_name: 'reporter-bot', notification_channel: 'C-MENTION' },
        tenantId: 'tenant-A',
      },
    ]);

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');
    const client = makeClient();

    await expect(handler({ event: mention(), client })).resolves.not.toThrow();

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const sent = inngest.send.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(sent.data.tenantId).toBe('tenant-A');
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

    expect(mockPrismaInstance.tenantIntegration.findMany).not.toHaveBeenCalled();
    expect(mockResolveEmployeesAcrossTenants).not.toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledTimes(1);
    const sent = inngest.send.mock.calls[0][0] as { name: string; data: Record<string, unknown> };
    expect(sent.name).toBe('employee/interaction.received');
    expect(sent.data.tenantId).toBeNull();
  });

  it('ack postMessage failure does not abort routing (still sends interaction.received)', async () => {
    mockPrismaInstance.tenantIntegration.findMany.mockResolvedValue([{ tenant_id: 'tenant-1' }]);
    mockResolveEmployeesAcrossTenants.mockResolvedValue([
      {
        archetype: { id: 'arch-1', role_name: 'Reporter', notification_channel: 'C-MENTION' },
        tenantId: 'tenant-1',
      },
    ]);

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');

    const client = makeClient();
    client.chat.postMessage.mockRejectedValueOnce(new Error('rate_limited'));

    await expect(handler({ event: mention(), client })).resolves.not.toThrow();
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it('disambiguation card: cap at 5 buttons even when more candidates exist', async () => {
    mockPrismaInstance.tenantIntegration.findMany.mockResolvedValue([
      { tenant_id: 'tenant-1' },
      { tenant_id: 'tenant-2' },
      { tenant_id: 'tenant-3' },
      { tenant_id: 'tenant-4' },
      { tenant_id: 'tenant-5' },
      { tenant_id: 'tenant-6' },
    ]);
    const manyCandidates = [1, 2, 3, 4, 5, 6].map((n) => ({
      archetype: {
        id: `arch-${n}`,
        role_name: `employee-${n}`,
        notification_channel: 'C-MENTION',
      },
      tenantId: `tenant-${n}`,
    }));
    mockResolveEmployeesAcrossTenants.mockResolvedValue(manyCandidates);
    mockRouteToEmployee.mockResolvedValue(null); // ambiguous

    const { boltApp, inngest } = register();
    const handler = boltApp._getEvent('app_mention');
    const client = makeClient();
    await handler({ event: mention(), client });

    expect(inngest.send).not.toHaveBeenCalled();
    const updateCall = client.chat.update.mock.calls[0][0] as {
      blocks: Array<{ type: string; elements?: unknown[] }>;
    };
    const actionsBlock = updateCall.blocks.find((b) => b.type === 'actions');
    expect(actionsBlock?.elements?.length).toBeLessThanOrEqual(5);
  });
});
