import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from '@slack/bolt';
import type { InngestLike } from '../../../../src/gateway/types.js';
import {
  registerSlackHandlers,
  _clearPendingInputCollections,
  _clearRecentMentions,
} from '../../../../src/gateway/slack/handlers.js';

const { mockResolveEmployeesAcrossTenants, mockRouteToEmployee } = vi.hoisted(() => ({
  mockResolveEmployeesAcrossTenants: vi.fn(),
  mockRouteToEmployee: vi.fn(),
}));

vi.mock('../../../../src/lib/call-llm.js', () => ({
  callLLM: vi.fn(),
}));

vi.mock('../../../../src/lib/extract-inputs.js', () => ({
  extractInputsFromText: vi.fn(),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({
    tenantIntegration: {
      findFirst: vi.fn().mockResolvedValue({ tenant_id: 'T-DEDUP-TENANT' }),
      findMany: vi.fn().mockResolvedValue([{ tenant_id: 'T-DEDUP-TENANT' }]),
    },
    task: { findFirst: vi.fn().mockResolvedValue(null) },
  })),
}));

vi.mock('../../../../src/lib/interaction-classifier.js', () => ({
  resolveArchetypeFromChannel: vi.fn().mockResolvedValue({ archetype: null, isExactMatch: false }),
  resolveEmployeesAcrossTenants: mockResolveEmployeesAcrossTenants,
}));

vi.mock('../../../../src/inngest/slack-trigger-handler.js', () => ({
  routeToEmployee: mockRouteToEmployee,
  prettifyRoleName: (name: string) => name,
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
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ack.001' }),
      update: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
}

function makeMentionEvent(
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
    ts: overrides.ts ?? '1234567890.000001',
    channel: overrides.channel ?? 'C123456',
    user: overrides.user ?? 'U123',
    text: overrides.text ?? '<@UBOT> hello',
    team: overrides.team ?? 'T123',
    bot_id: overrides.bot_id,
    thread_ts: overrides.thread_ts,
  };
}

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  _clearPendingInputCollections();
  _clearRecentMentions();

  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';

  mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });
  vi.stubGlobal('fetch', mockFetch);

  mockPrismaForDedup.tenantIntegration.findMany.mockResolvedValue([
    { tenant_id: 'T-DEDUP-TENANT' },
  ]);
  mockPrismaForDedup.tenantIntegration.findFirst.mockResolvedValue({ tenant_id: 'T-DEDUP-TENANT' });
  mockPrismaForDedup.task.findFirst.mockResolvedValue(null);

  mockResolveEmployeesAcrossTenants.mockResolvedValue([
    {
      archetype: { id: 'arch-dedup', role_name: 'dedup-bot', notification_channel: 'C123456' },
      tenantId: 'T-DEDUP-TENANT',
    },
  ]);
  mockRouteToEmployee.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
});

const mockPrismaForDedup = {
  tenantIntegration: {
    findFirst: vi.fn().mockResolvedValue({ tenant_id: 'T-DEDUP-TENANT' }),
    findMany: vi.fn().mockResolvedValue([{ tenant_id: 'T-DEDUP-TENANT' }]),
  },
  task: { findFirst: vi.fn().mockResolvedValue(null) },
  employeeRule: { update: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
};

function register() {
  const boltApp = makeMockBoltApp();
  const inngest = makeMockInngest();
  registerSlackHandlers(boltApp as unknown as App, inngest, mockPrismaForDedup as never);
  return { boltApp, inngest };
}

describe('app_mention deduplication', () => {
  it('same ts+channel within 30s → inngest.send called exactly once', async () => {
    const { boltApp, inngest } = register();

    const handler = boltApp._getEvent('app_mention');
    expect(handler).toBeDefined();

    const event = makeMentionEvent({ ts: '111.001', channel: 'C_DEDUP' });
    const client = makeClient();

    await handler({ event, client });
    await handler({ event, client });

    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it('different ts values → inngest.send called exactly twice', async () => {
    const { boltApp, inngest } = register();

    const handler = boltApp._getEvent('app_mention');
    const client = makeClient();

    await handler({ event: makeMentionEvent({ ts: '222.001', channel: 'C_DIFF_TS' }), client });
    await handler({ event: makeMentionEvent({ ts: '222.002', channel: 'C_DIFF_TS' }), client });

    expect(inngest.send).toHaveBeenCalledTimes(2);
  });

  it('same ts+channel after TTL expiry (31s) → inngest.send called twice', async () => {
    const { boltApp, inngest } = register();

    const handler = boltApp._getEvent('app_mention');
    const event = makeMentionEvent({ ts: '333.001', channel: 'C_TTL' });
    const client = makeClient();

    const baseTime = 1_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(baseTime);
    await handler({ event, client });

    vi.spyOn(Date, 'now').mockReturnValue(baseTime + 31_000);
    await handler({ event, client });

    expect(inngest.send).toHaveBeenCalledTimes(2);
  });

  it('same ts but different channel → inngest.send called exactly twice', async () => {
    const { boltApp, inngest } = register();

    const handler = boltApp._getEvent('app_mention');
    const client = makeClient();

    await handler({ event: makeMentionEvent({ ts: '444.001', channel: 'C_CHAN_A' }), client });
    await handler({ event: makeMentionEvent({ ts: '444.001', channel: 'C_CHAN_B' }), client });

    expect(inngest.send).toHaveBeenCalledTimes(2);
  });
});
