import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from '@slack/bolt';
import type { InngestLike } from '../../../src/gateway/types.js';
import {
  registerSlackHandlers,
  _clearPendingInputCollections,
} from '../../../src/gateway/slack/handlers.js';

const { mockCallLLM, mockExtractInputsFromText, mockPrismaInstance } = vi.hoisted(() => {
  const instance = {
    archetype: {
      findFirst: vi.fn(),
    },
    task: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return {
    mockCallLLM: vi.fn(),
    mockExtractInputsFromText: vi.fn(),
    mockPrismaInstance: instance,
  };
});

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrismaInstance),
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

function makeArchetypeRow(inputSchema: InputSchemaItem[]) {
  return {
    id: 'arch-1',
    role_name: 'Cleaning Schedule',
    input_schema: inputSchema,
  };
}

function makeActionBody(
  ctx: {
    archetypeId?: string;
    tenantId?: string;
    channelId?: string;
    threadTs?: string;
    text?: string;
    extractedInputs?: Record<string, string>;
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
          ...(ctx.extractedInputs !== undefined ? { extractedInputs: ctx.extractedInputs } : {}),
        }),
      },
    ],
    user: { id: 'U123', name: 'testuser' },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearPendingInputCollections();

  mockPrismaInstance.archetype.findFirst.mockResolvedValue(
    makeArchetypeRow([{ key: 'date', label: 'Checkout Date', type: 'date', required: true }]),
  );
  mockPrismaInstance.task.create.mockResolvedValue({ id: 'task-123' });
  mockPrismaInstance.task.findFirst.mockResolvedValue(null);
  mockPrismaInstance.$disconnect.mockResolvedValue(undefined);

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
  vi.clearAllMocks();
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
    expect(postMessageCall.text).toContain('One moment');

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
    mockPrismaInstance.archetype.findFirst.mockResolvedValue(
      makeArchetypeRow([
        { key: 'date', label: 'Checkout Date', type: 'date', required: true },
        { key: 'time', label: 'Checkout Time', type: 'time', required: true },
      ]),
    );

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
    mockPrismaInstance.archetype.findFirst.mockResolvedValue(
      makeArchetypeRow([
        { key: 'date', label: 'Checkout Date', type: 'date', required: true },
        { key: 'time', label: 'Checkout Time', type: 'time', required: true },
      ]),
    );

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
    expect(
      respondTexts.some((t) => t.includes('ran into a problem') || t.includes('trying again')),
    ).toBe(true);
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('no required inputs → dispatches immediately without asking for inputs', async () => {
    mockPrismaInstance.archetype.findFirst.mockResolvedValue(makeArchetypeRow([]));

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

  it('allFound path — dispatches exactly once, no double-dispatch', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const respond = makeRespond();
    const client = makeClient();

    await handler({ ack: makeAck(), body: makeActionBody(), respond, client });

    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(client.chat.postMessage).toHaveBeenCalledTimes(1);
    const respondTexts = respond.mock.calls.map((call) => (call[0] as { text: string }).text);
    expect(respondTexts.some((t) => t.includes('Failed to trigger') || t.includes('⚠️'))).toBe(
      false,
    );
  });

  it('allFound path — respond throws after dispatch → no failure message shown', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const respond = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('expired_url'));
    const client = makeClient();

    await expect(
      handler({ ack: makeAck(), body: makeActionBody(), respond, client }),
    ).resolves.not.toThrow();

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const respondTexts = respond.mock.calls.map((call) => (call[0] as { text: string }).text);
    expect(respondTexts.some((t) => t.includes('Failed to trigger') || t.includes('⚠️'))).toBe(
      false,
    );
  });

  it('allFound path — empty LLM confirmText → fallback used, dispatch succeeds', async () => {
    mockCallLLM.mockResolvedValue({
      content: '',
      model: 'test',
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0,
    });

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const client = makeClient();

    await handler({ ack: makeAck(), body: makeActionBody(), respond: makeRespond(), client });

    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const postMessageCall = client.chat.postMessage.mock.calls[0][0] as { text: string };
    expect(postMessageCall.text.length).toBeGreaterThan(0);
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it('allFound path — undefined LLM content → no TypeError, fallback used', async () => {
    mockCallLLM.mockResolvedValue({
      content: undefined as unknown as string,
      model: 'test',
      promptTokens: 0,
      completionTokens: 0,
      estimatedCostUsd: 0,
      latencyMs: 0,
    });

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const client = makeClient();

    await expect(
      handler({ ack: makeAck(), body: makeActionBody(), respond: makeRespond(), client }),
    ).resolves.not.toThrow();

    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const postMessageCall = client.chat.postMessage.mock.calls[0][0] as { text: string };
    expect(postMessageCall.text.length).toBeGreaterThan(0);
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it('default path (no required inputs) — respond throws after dispatch → no failure message', async () => {
    mockPrismaInstance.archetype.findFirst.mockResolvedValue(makeArchetypeRow([]));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const respond = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('expired_url'));

    await expect(
      handler({ ack: makeAck(), body: makeActionBody(), respond, client: makeClient() }),
    ).resolves.not.toThrow();

    expect(inngest.send).toHaveBeenCalledTimes(1);
    const respondTexts = respond.mock.calls.map((call) => (call[0] as { text: string }).text);
    expect(respondTexts.some((t) => t.includes('Failed to trigger') || t.includes('⚠️'))).toBe(
      false,
    );
  });

  it('pre-extracted inputs present → zero LLM on click, dispatches immediately', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const respond = makeRespond();
    const client = makeClient();

    await handler({
      ack: makeAck(),
      body: makeActionBody({ extractedInputs: { date: '2026-06-10' } }),
      respond,
      client,
    });

    expect(mockExtractInputsFromText).not.toHaveBeenCalled();
    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledTimes(1);
    const firstRespondText = (respond.mock.calls[0][0] as { text: string }).text;
    expect(firstRespondText).toContain('One moment');
  });

  it('allFound path — zero callLLM (cosmetic removal verified)', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const client = makeClient();

    await handler({ ack: makeAck(), body: makeActionBody(), respond: makeRespond(), client });

    expect(mockCallLLM).not.toHaveBeenCalled();
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it('backward-compat fallback — no extractedInputs in value → extractInputsFromText IS called', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const client = makeClient();

    await handler({ ack: makeAck(), body: makeActionBody(), respond: makeRespond(), client });

    expect(mockExtractInputsFromText).toHaveBeenCalledOnce();
    expect(inngest.send).toHaveBeenCalledTimes(1);
  });

  it('loading respond has no actions block (buttons removed on click)', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const respond = makeRespond();
    const client = makeClient();

    await handler({ ack: makeAck(), body: makeActionBody(), respond, client });

    expect(respond).toHaveBeenCalled();
    const firstRespondPayload = respond.mock.calls[0][0] as {
      replace_original?: boolean;
      blocks?: Array<{ type: string }>;
    };
    expect(firstRespondPayload.replace_original).toBe(true);
    const hasActionsBlock = (firstRespondPayload.blocks ?? []).some((b) => b.type === 'actions');
    expect(hasActionsBlock).toBe(false);
  });

  it('someFound with pre-extracted partial → missing-info path without calling extractInputsFromText', async () => {
    mockPrismaInstance.archetype.findFirst.mockResolvedValue(
      makeArchetypeRow([
        { key: 'date', label: 'Checkout Date', type: 'date', required: true },
        { key: 'location', label: 'Property Location', type: 'text', required: true },
      ]),
    );

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('trigger_confirm');
    const client = makeClient();

    await handler({
      ack: makeAck(),
      body: makeActionBody({ extractedInputs: { date: '2026-06-10' } }),
      respond: makeRespond(),
      client,
    });

    expect(mockExtractInputsFromText).not.toHaveBeenCalled();
    expect(inngest.send).not.toHaveBeenCalled();
    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const postBody = client.chat.postMessage.mock.calls[0][0] as { text: string };
    expect(postBody.text).toContain('Property Location');
    expect(postBody.text).not.toContain('Checkout Date');
  });
});
