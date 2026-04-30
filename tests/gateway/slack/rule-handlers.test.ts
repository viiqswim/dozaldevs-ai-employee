import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from '@slack/bolt';
import type { InngestLike } from '../../../src/gateway/types.js';
import { registerSlackHandlers } from '../../../src/gateway/slack/handlers.js';

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

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';
});

describe('rule_confirm handler', () => {
  it('ack called with replace_original ✅ message and PATCH status: confirmed + confirmed_at', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest());

    const handler = boltApp._getAction('rule_confirm');
    expect(handler).toBeDefined();

    const ack = makeAck();
    await handler({
      ack,
      body: {
        actions: [{ value: 'rule-abc-123' }],
        user: { id: 'U-APPROVER', name: 'approver' },
      },
      respond: vi.fn(),
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledOnce();
    const ackArg = (ack.mock.calls[0] as unknown[])[0] as {
      replace_original: boolean;
      blocks: Array<{ type: string; text?: { text: string }; elements?: unknown[] }>;
    };
    expect(ackArg.replace_original).toBe(true);
    const sectionBlock = ackArg.blocks.find((b) => b.type === 'section');
    expect(sectionBlock?.text?.text).toContain('✅');
    expect(sectionBlock?.text?.text).toContain('<@U-APPROVER>');

    const patchCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('learned_rules?id=eq.rule-abc-123') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(patchBody.status).toBe('confirmed');
    expect(typeof patchBody.confirmed_at).toBe('string');

    vi.unstubAllGlobals();
  });

  it('missing ruleId → plain ack called, no PATCH to DB', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest());

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
    const patchCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('learned_rules') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeUndefined();

    vi.unstubAllGlobals();
  });
});

describe('rule_reject handler', () => {
  it('ack called with replace_original ❌ message and PATCH status: rejected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest());

    const handler = boltApp._getAction('rule_reject');
    expect(handler).toBeDefined();

    const ack = makeAck();
    await handler({
      ack,
      body: {
        actions: [{ value: 'rule-xyz-456' }],
        user: { id: 'U-REJECTER', name: 'rejecter' },
      },
      respond: vi.fn(),
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledOnce();
    const ackArg = (ack.mock.calls[0] as unknown[])[0] as {
      replace_original: boolean;
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    expect(ackArg.replace_original).toBe(true);
    const sectionBlock = ackArg.blocks.find((b) => b.type === 'section');
    expect(sectionBlock?.text?.text).toContain('❌');
    expect(sectionBlock?.text?.text).toContain('<@U-REJECTER>');

    const patchCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('learned_rules?id=eq.rule-xyz-456') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(patchBody.status).toBe('rejected');
    expect(patchBody).not.toHaveProperty('confirmed_at');

    vi.unstubAllGlobals();
  });
});

describe('rule_rephrase handler', () => {
  it('fetches current rule_text and opens modal with rule_rephrase_modal callback_id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve([{ rule_text: 'Existing rule text' }]) });
    vi.stubGlobal('fetch', fetchMock);

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest());

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

    const getFetch = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('learned_rules?id=eq.rule-rephrase-789') &&
        args[0].includes('select=rule_text'),
    );
    expect(getFetch).toBeDefined();

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

    vi.unstubAllGlobals();
  });
});

describe('rule_rephrase_modal view handler', () => {
  it('PATCHes rule_text and calls chat.update with fresh 3-button block kit', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('select=slack_ts')) {
        return {
          json: () =>
            Promise.resolve([{ slack_ts: 'ts-original-111', slack_channel: 'C-RULE-CHAN' }]),
        };
      }
      return { json: () => Promise.resolve([]) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest());

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

    const patchCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('learned_rules?id=eq.rule-modal-001') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(patchBody.rule_text).toBe('Updated rule: always greet by name');

    expect(client.chat.update).toHaveBeenCalledOnce();
    const updateCall = client.chat.update.mock.calls[0][0] as {
      channel: string;
      ts: string;
      blocks: Array<{ type: string; elements?: Array<{ action_id: string }> }>;
    };
    expect(updateCall.channel).toBe('C-RULE-CHAN');
    expect(updateCall.ts).toBe('ts-original-111');

    const actionsBlock = updateCall.blocks.find((b) => b.type === 'actions');
    expect(actionsBlock).toBeDefined();
    const actionIds = actionsBlock!.elements!.map((e) => e.action_id);
    expect(actionIds).toEqual(
      expect.arrayContaining(['rule_confirm', 'rule_reject', 'rule_rephrase']),
    );

    vi.unstubAllGlobals();
  });

  it('empty rule_text → validation error ack, no PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', fetchMock);

    const boltApp = makeMockBoltApp();
    registerSlackHandlers(boltApp as unknown as App, makeMockInngest());

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

    const patchCall = fetchMock.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('learned_rules') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCall).toBeUndefined();

    vi.unstubAllGlobals();
  });
});
