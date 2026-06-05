import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from '@slack/bolt';
import type { InngestLike } from '../../../src/gateway/types.js';
import {
  registerSlackHandlers,
  _clearPendingInputCollections,
} from '../../../src/gateway/slack/handlers.js';

const { mockCallLLM, mockExtractInputsFromText } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
  mockExtractInputsFromText: vi.fn(),
}));

vi.mock('../../../src/lib/call-llm.js', () => ({
  callLLM: mockCallLLM,
}));

vi.mock('../../../src/lib/extract-inputs.js', () => ({
  extractInputsFromText: mockExtractInputsFromText,
}));

type ActionHandler = (args: {
  ack: unknown;
  body: unknown;
  respond: unknown;
  client: unknown;
}) => Promise<void>;

function makeMockBoltApp() {
  const handlers = new Map<string, ActionHandler>();
  const boltApp = {
    use: vi.fn(),
    action: vi.fn((id: string, handler: ActionHandler) => {
      handlers.set(`action:${id}`, handler);
    }),
    view: vi.fn(),
    event: vi.fn(),
    _getAction: (id: string) => handlers.get(`action:${id}`) as ActionHandler,
  };
  return boltApp;
}

function makeMockInngest(): InngestLike & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue({ ids: ['mock-id'] }) };
}

function makeAck() {
  return vi.fn().mockResolvedValue(undefined);
}

function makeRespond() {
  return vi.fn().mockResolvedValue(undefined);
}

function makeClient() {
  return {
    views: { open: vi.fn().mockResolvedValue({ ok: true }) },
    chat: {
      update: vi.fn().mockResolvedValue({ ok: true }),
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: '1234567890.000002' }),
    },
  };
}

interface InputSchemaItem {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  description?: string;
  options?: string[];
}

function makeArchetypeResponse(inputSchema: InputSchemaItem[]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve([
        {
          id: 'arch-1',
          role_name: 'Cleaning Schedule',
          input_schema: inputSchema,
        },
      ]),
  };
}

function makeTaskCreationResponse() {
  return {
    ok: true,
    json: () => Promise.resolve([{ id: 'task-123' }]),
  };
}

function makeActionBody(
  ctx: {
    archetypeId?: string;
    tenantId?: string;
    channelId?: string;
    threadTs?: string;
    text?: string;
  } = {},
) {
  return {
    actions: [
      {
        value: JSON.stringify({
          archetypeId: ctx.archetypeId ?? 'arch-1',
          tenantId: ctx.tenantId ?? 'tenant-1',
          userId: 'U123',
          channelId: ctx.channelId ?? 'C123',
          threadTs: ctx.threadTs ?? '1234567890.000001',
          text: ctx.text ?? 'trigger cleaning schedule for June 5th',
        }),
      },
    ],
    user: { id: 'U123', name: 'testuser' },
  };
}

let mockFetch: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  _clearPendingInputCollections();

  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';

  mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    if (typeof url === 'string' && url.includes('/rest/v1/archetypes')) {
      return Promise.resolve(
        makeArchetypeResponse([
          { key: 'date', label: 'Checkout Date', type: 'date', required: true },
        ]),
      );
    }
    if (typeof url === 'string' && url.includes('/rest/v1/tasks') && opts?.method === 'POST') {
      return Promise.resolve(makeTaskCreationResponse());
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  });
  vi.stubGlobal('fetch', mockFetch);

  mockCallLLM.mockResolvedValue({
    content: 'Just to confirm, you want me to run Cleaning Schedule for June 5th. Working on it!',
    model: 'test',
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
    latencyMs: 0,
  });

  mockExtractInputsFromText.mockResolvedValue({ date: '2026-06-05' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
});

describe('TRIGGER_CONFIRM handler — extraction paths', () => {
  it('all inputs extracted → posts confirmation, dispatches task immediately', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const respond = makeRespond();
    const client = makeClient();

    await handler({ ack, body: makeActionBody(), respond, client });

    expect(ack).toHaveBeenCalledOnce();
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const postMessageCall = client.chat.postMessage.mock.calls[0][0];
    expect(postMessageCall.text).not.toContain('I need a few details');
    expect(postMessageCall.text).toContain('Working on it');

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/task.dispatched',
        data: expect.objectContaining({ archetypeId: 'arch-1' }),
      }),
    );

    const respondCalls = respond.mock.calls;
    const finalRespond = respondCalls[respondCalls.length - 1][0];
    expect(finalRespond.text).toContain('✅');
  });

  it('partial extraction → asks only for missing inputs, does not dispatch', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/rest/v1/archetypes')) {
        return Promise.resolve(
          makeArchetypeResponse([
            { key: 'date', label: 'Checkout Date', type: 'date', required: true },
            { key: 'time', label: 'Checkout Time', type: 'time', required: true },
          ]),
        );
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    mockExtractInputsFromText.mockResolvedValue({ date: '2026-06-05' });

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const client = makeClient();

    await handler({ ack: makeAck(), body: makeActionBody(), respond: makeRespond(), client });

    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const postBody = client.chat.postMessage.mock.calls[0][0];
    expect(postBody.text).toContain('Checkout Time');
    expect(postBody.text).not.toContain('Checkout Date');
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('no inputs extracted → asks for all required inputs, does not dispatch', async () => {
    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/rest/v1/archetypes')) {
        return Promise.resolve(
          makeArchetypeResponse([
            { key: 'date', label: 'Checkout Date', type: 'date', required: true },
            { key: 'time', label: 'Checkout Time', type: 'time', required: true },
          ]),
        );
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    mockExtractInputsFromText.mockResolvedValue({});

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const client = makeClient();

    await handler({ ack: makeAck(), body: makeActionBody(), respond: makeRespond(), client });

    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const postBody = client.chat.postMessage.mock.calls[0][0];
    expect(postBody.text).toContain('Checkout Date');
    expect(postBody.text).toContain('Checkout Time');

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('extraction throws → handler does not crash, posts failure respond', async () => {
    mockExtractInputsFromText.mockRejectedValue(new Error('Extraction failed'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const respond = makeRespond();

    await expect(
      handler({ ack: makeAck(), body: makeActionBody(), respond, client: makeClient() }),
    ).resolves.not.toThrow();

    const respondTexts = respond.mock.calls.map((call) => (call[0] as { text: string }).text);
    expect(respondTexts.some((t) => t.includes('Failed to trigger') || t.includes('⚠️'))).toBe(
      true,
    );
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('no required inputs → dispatches immediately without asking for inputs', async () => {
    mockFetch.mockImplementation((url: string, opts?: RequestInit) => {
      if (typeof url === 'string' && url.includes('/rest/v1/archetypes')) {
        return Promise.resolve(makeArchetypeResponse([]));
      }
      if (typeof url === 'string' && url.includes('/rest/v1/tasks') && opts?.method === 'POST') {
        return Promise.resolve(makeTaskCreationResponse());
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
    });

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const client = makeClient();
    const respond = makeRespond();

    await handler({ ack: makeAck(), body: makeActionBody(), respond, client });

    expect(mockExtractInputsFromText).not.toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'employee/task.dispatched' }),
    );
    expect(client.chat.postMessage).not.toHaveBeenCalled();

    const respondCalls = respond.mock.calls;
    const finalRespond = respondCalls[respondCalls.length - 1][0];
    expect(finalRespond.text).toContain('✅');
  });

  it('_clearPendingInputCollections — clears the map without throwing', () => {
    expect(() => _clearPendingInputCollections()).not.toThrow();
  });
});
