import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from '@slack/bolt';
import type { PrismaClient } from '@prisma/client';
import type { InngestLike } from '../../../../src/gateway/types.js';
import { registerSlackHandlers } from '../../../../src/gateway/slack/handlers.js';

type ActionHandler = (args: {
  ack: unknown;
  body: unknown;
  respond: unknown;
  client: unknown;
}) => Promise<void>;

type ViewHandler = (args: {
  ack: unknown;
  view: unknown;
  body: unknown;
  client: unknown;
}) => Promise<void>;

type EventHandler = (args: { event: unknown }) => Promise<void>;

function makeMockBoltApp() {
  const handlers = new Map<string, ActionHandler | ViewHandler | EventHandler>();

  const boltApp = {
    use: vi.fn(),
    action: vi.fn((id: string, handler: ActionHandler) => {
      handlers.set(`action:${id}`, handler);
    }),
    view: vi.fn((id: string, handler: ViewHandler) => {
      handlers.set(`view:${id}`, handler);
    }),
    event: vi.fn((id: string, handler: EventHandler) => {
      handlers.set(`event:${id}`, handler);
    }),
    _getAction: (id: string) => handlers.get(`action:${id}`) as ActionHandler,
    _getView: (id: string) => handlers.get(`view:${id}`) as ViewHandler,
  };

  return boltApp;
}

function makeMockInngest(): InngestLike & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue({ ids: ['mock-id'] }) };
}

function makeAck() {
  return vi.fn().mockResolvedValue(undefined);
}

function makeClient() {
  return {
    views: {
      open: vi.fn().mockResolvedValue({ ok: true }),
    },
    chat: {
      update: vi.fn().mockResolvedValue({ ok: true }),
    },
  };
}

function makeFullRule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-abc-123',
    tenant_id: 'tenant-1',
    archetype_id: 'arch-1',
    source: 'extraction',
    parent_rule_ids: [],
    rule_text: 'Never discuss pricing with guests',
    slack_ts: null,
    slack_channel: null,
    status: 'confirmed',
    source_task_id: null,
    created_at: new Date(),
    confirmed_at: new Date(),
    deleted_at: null,
    ...overrides,
  };
}

function makeMockPrisma(
  overrides: {
    updateResult?: Record<string, unknown>;
    countResult?: number;
    findFirstResult?: Record<string, unknown> | null;
  } = {},
): PrismaClient {
  return {
    employeeRule: {
      update: vi.fn().mockResolvedValue(overrides.updateResult ?? makeFullRule()),
      count: vi.fn().mockResolvedValue(overrides.countResult ?? 0),
      findFirst: vi.fn().mockResolvedValue(overrides.findFirstResult ?? makeFullRule()),
    },
  } as unknown as PrismaClient;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';
});

describe('rule_confirm handler', () => {
  it('ack called with ✅ message (including rule text) and patchConfirm called with ruleId and userId', async () => {
    const mockPrisma = makeMockPrisma({
      updateResult: makeFullRule({ rule_text: 'Never discuss pricing with guests' }),
      countResult: 0,
    });

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest(), mockPrisma);

    const handler = boltApp._getAction('rule_confirm');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const client = makeClient();
    await handler({
      ack,
      body: {
        actions: [{ value: 'rule-abc-123' }],
        user: { id: 'U-APPROVER', name: 'approver' },
        channel: { id: 'C-TEST' },
        message: { ts: '1234567890.000001' },
      },
      respond: vi.fn(),
      client,
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledWith();

    expect(client.chat.update).toHaveBeenCalledTimes(2);
    const updateCall = client.chat.update.mock.calls[1][0] as {
      channel: string;
      ts: string;
      blocks: Array<{ type: string; text?: { text: string }; elements?: unknown[] }>;
    };
    const sectionBlock = updateCall.blocks.find((b) => b.type === 'section');
    expect(sectionBlock?.text?.text).toContain('✅');
    expect(sectionBlock?.text?.text).toContain('<@U-APPROVER>');
    expect(sectionBlock?.text?.text).toContain('Never discuss pricing with guests');

    const { employeeRule } = mockPrisma as unknown as {
      employeeRule: { update: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    };
    expect(employeeRule.update).toHaveBeenCalledOnce();
    const updateArgs = employeeRule.update.mock.calls[0][0] as {
      where: { id: string };
      data: { status: string; confirmed_at: Date };
    };
    expect(updateArgs.where.id).toBe('rule-abc-123');
    expect(updateArgs.data.status).toBe('confirmed');
    expect(updateArgs.data.confirmed_at).toBeInstanceOf(Date);
  });

  it('confirm message falls back to name-only when rule_text is empty', async () => {
    const mockPrisma = makeMockPrisma({
      updateResult: makeFullRule({ rule_text: '' }),
      countResult: 0,
    });

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest(), mockPrisma);

    const handler = boltApp._getAction('rule_confirm');
    const ack = makeAck();
    const client = makeClient();
    await handler({
      ack,
      body: {
        actions: [{ value: 'rule-abc-123' }],
        user: { id: 'U-APPROVER', name: 'approver' },
        channel: { id: 'C-TEST' },
        message: { ts: '1234567890.000001' },
      },
      respond: vi.fn(),
      client,
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(client.chat.update).toHaveBeenCalledTimes(2);
    const updateCall = client.chat.update.mock.calls[1][0] as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const sectionBlock = updateCall.blocks.find((b) => b.type === 'section');
    expect(sectionBlock?.text?.text).toContain('✅');
    expect(sectionBlock?.text?.text).toContain('<@U-APPROVER>');
    expect(sectionBlock?.text?.text).not.toContain('\n\n>');
  });

  it('missing ruleId → plain ack called, no Prisma update', async () => {
    const mockPrisma = makeMockPrisma();

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest(), mockPrisma);

    const handler = boltApp._getAction('rule_confirm');
    const ack = makeAck();

    await handler({
      ack,
      body: {
        actions: [{ value: undefined }],
        user: { id: 'U1', name: 'u1' },
      },
      respond: vi.fn(),
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledOnce();
    const { employeeRule } = mockPrisma as unknown as {
      employeeRule: { update: ReturnType<typeof vi.fn> };
    };
    expect(employeeRule.update).not.toHaveBeenCalled();
  });
});

describe('rule_reject handler', () => {
  it('ack called with ❌ message (including rule text) and patchReject called with ruleId', async () => {
    const mockPrisma = makeMockPrisma({
      updateResult: makeFullRule({
        rule_text: 'Always greet guests by first name',
        status: 'rejected',
      }),
    });

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest(), mockPrisma);

    const handler = boltApp._getAction('rule_reject');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const client = makeClient();
    await handler({
      ack,
      body: {
        actions: [{ value: 'rule-xyz-456' }],
        user: { id: 'U-REJECTER', name: 'rejecter' },
        channel: { id: 'C-TEST' },
        message: { ts: '1234567890.000002' },
      },
      respond: vi.fn(),
      client,
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledWith();

    expect(client.chat.update).toHaveBeenCalledTimes(2);
    const updateCall = client.chat.update.mock.calls[1][0] as {
      channel: string;
      ts: string;
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const sectionBlock = updateCall.blocks.find((b) => b.type === 'section');
    expect(sectionBlock?.text?.text).toContain('❌');
    expect(sectionBlock?.text?.text).toContain('<@U-REJECTER>');
    expect(sectionBlock?.text?.text).toContain('Always greet guests by first name');

    const { employeeRule } = mockPrisma as unknown as {
      employeeRule: { update: ReturnType<typeof vi.fn> };
    };
    expect(employeeRule.update).toHaveBeenCalledOnce();
    const updateArgs = employeeRule.update.mock.calls[0][0] as {
      where: { id: string };
      data: { status: string };
    };
    expect(updateArgs.where.id).toBe('rule-xyz-456');
    expect(updateArgs.data.status).toBe('rejected');
    expect(updateArgs.data).not.toHaveProperty('confirmed_at');
  });

  it('reject message falls back to name-only when rule_text is empty', async () => {
    const mockPrisma = makeMockPrisma({
      updateResult: makeFullRule({ rule_text: '', status: 'rejected' }),
    });

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest(), mockPrisma);

    const handler = boltApp._getAction('rule_reject');
    const ack = makeAck();
    const client = makeClient();
    await handler({
      ack,
      body: {
        actions: [{ value: 'rule-xyz-456' }],
        user: { id: 'U-REJECTER', name: 'rejecter' },
        channel: { id: 'C-TEST' },
        message: { ts: '1234567890.000002' },
      },
      respond: vi.fn(),
      client,
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(client.chat.update).toHaveBeenCalledTimes(2);
    const updateCall = client.chat.update.mock.calls[1][0] as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const sectionBlock = updateCall.blocks.find((b) => b.type === 'section');
    expect(sectionBlock?.text?.text).toContain('❌');
    expect(sectionBlock?.text?.text).toContain('<@U-REJECTER>');
    expect(sectionBlock?.text?.text).not.toContain('\n\n>');
  });
});

describe('rule_rephrase handler', () => {
  it('fetches current rule_text via get() and opens modal with rule_rephrase_modal callback_id', async () => {
    const mockPrisma = makeMockPrisma({
      findFirstResult: makeFullRule({ rule_text: 'Existing rule text' }),
    });

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest(), mockPrisma);

    const handler = boltApp._getAction('rule_rephrase');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const client = makeClient();

    await handler({
      ack,
      body: {
        actions: [{ value: 'rule-rephrase-789' }],
        user: { id: 'U-REPHRASER', name: 'rephraser' },
        trigger_id: 'trigger-rephrase-abc',
      },
      respond: vi.fn(),
      client,
    });

    expect(ack).toHaveBeenCalledOnce();

    const { employeeRule } = mockPrisma as unknown as {
      employeeRule: { findFirst: ReturnType<typeof vi.fn> };
    };
    expect(employeeRule.findFirst).toHaveBeenCalledOnce();
    const findArgs = employeeRule.findFirst.mock.calls[0][0] as {
      where: { id: string };
    };
    expect(findArgs.where.id).toBe('rule-rephrase-789');

    expect(client.views.open).toHaveBeenCalledOnce();
    const openCall = client.views.open.mock.calls[0][0] as {
      trigger_id: string;
      view: {
        callback_id: string;
        private_metadata: string;
        blocks: Array<{ block_id?: string; element?: { initial_value?: string } }>;
      };
    };
    expect(openCall.trigger_id).toBe('trigger-rephrase-abc');
    expect(openCall.view.callback_id).toBe('rule_rephrase_modal');
    expect(JSON.parse(openCall.view.private_metadata)).toMatchObject({
      ruleId: 'rule-rephrase-789',
    });

    const inputBlock = openCall.view.blocks.find((b) => b.block_id === 'rule_input');
    expect(inputBlock?.element?.initial_value).toBe('Existing rule text');
  });
});

describe('rule_rephrase_modal view handler', () => {
  it('calls patchRephrase and updates chat with fresh 3-button block kit using slack_ts from return value', async () => {
    const mockPrisma = makeMockPrisma({
      updateResult: makeFullRule({
        id: 'rule-modal-001',
        rule_text: 'Updated rule: always greet by name',
        slack_ts: 'ts-original-111',
        slack_channel: 'C-RULE-CHAN',
      }),
    });

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest(), mockPrisma);

    const handler = boltApp._getView('rule_rephrase_modal') as ViewHandler;
    expect(handler).toBeDefined();

    const ack = makeAck();
    const client = makeClient();

    await handler({
      ack,
      view: {
        state: {
          values: {
            rule_input: {
              rule_text: { value: 'Updated rule: always greet by name' },
            },
          },
        },
        private_metadata: JSON.stringify({ ruleId: 'rule-modal-001' }),
      },
      body: {},
      client,
    });

    expect(ack).toHaveBeenCalledOnce();

    const { employeeRule } = mockPrisma as unknown as {
      employeeRule: { update: ReturnType<typeof vi.fn> };
    };
    expect(employeeRule.update).toHaveBeenCalledOnce();
    const updateArgs = employeeRule.update.mock.calls[0][0] as {
      where: { id: string };
      data: { rule_text: string };
    };
    expect(updateArgs.where.id).toBe('rule-modal-001');
    expect(updateArgs.data.rule_text).toBe('Updated rule: always greet by name');

    expect(client.chat.update).toHaveBeenCalledOnce();
    const chatUpdateCall = client.chat.update.mock.calls[0][0] as {
      channel: string;
      ts: string;
      blocks: Array<{ type: string; elements?: Array<{ action_id: string }> }>;
    };
    expect(chatUpdateCall.channel).toBe('C-RULE-CHAN');
    expect(chatUpdateCall.ts).toBe('ts-original-111');

    const actionsBlock = chatUpdateCall.blocks.find((b) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    const actionIds = actionsBlock!.elements!.map((e) => e.action_id);
    expect(actionIds).toEqual(
      expect.arrayContaining(['rule_confirm', 'rule_reject', 'rule_rephrase']),
    );
  });

  it('empty rule_text → validation error ack, no Prisma update', async () => {
    const mockPrisma = makeMockPrisma();

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest(), mockPrisma);

    const handler = boltApp._getView('rule_rephrase_modal') as ViewHandler;
    const ack = makeAck();

    await handler({
      ack,
      view: {
        state: {
          values: {
            rule_input: { rule_text: { value: '   ' } },
          },
        },
        private_metadata: JSON.stringify({ ruleId: 'rule-empty-test' }),
      },
      body: {},
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledOnce();
    const ackArg = (ack.mock.calls[0] as unknown[])[0] as { response_action: string };
    expect(ackArg.response_action).toBe('errors');

    const { employeeRule } = mockPrisma as unknown as {
      employeeRule: { update: ReturnType<typeof vi.fn> };
    };
    expect(employeeRule.update).not.toHaveBeenCalled();
  });
});
