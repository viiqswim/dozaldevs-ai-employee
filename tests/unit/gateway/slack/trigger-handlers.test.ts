import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from '@slack/bolt';
import type { InngestLike } from '../../../../src/gateway/types.js';
import {
  registerSlackHandlers,
  _clearPendingInputCollections,
} from '../../../../src/gateway/slack/handlers.js';
import { pendingInputCollections } from '../../../../src/gateway/slack/handlers/shared.js';

const { mockCallLLM, mockExtractInputsFromText, mockPrismaInstance } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
  mockExtractInputsFromText: vi.fn(),
  mockPrismaInstance: {
    archetype: { findFirst: vi.fn() },
    task: { create: vi.fn(), findFirst: vi.fn() },
    deliverable: { findFirst: vi.fn() },
    tenantIntegration: { findFirst: vi.fn() },
    employeeRule: { update: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrismaInstance),
}));

vi.mock('../../../../src/lib/call-llm.js', () => ({
  callLLM: mockCallLLM,
}));

vi.mock('../../../../src/lib/extract-inputs.js', () => ({
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
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'posted.000001' }),
    },
  };
}

function register() {
  const boltApp = makeMockBoltApp();
  const inngest = makeMockInngest();
  registerSlackHandlers(boltApp as unknown as App, inngest, mockPrismaInstance as never);
  return { boltApp, inngest };
}

function cancelBody(value?: string) {
  return {
    actions: [value !== undefined ? { value } : {}],
    user: { id: 'U-CANCEL', name: 'canceller' },
  };
}

function confirmBody(
  ctx: {
    archetypeId?: string;
    tenantId?: string;
    channelId?: string;
    threadTs?: string | undefined;
    text?: string;
  } = {},
) {
  const value = JSON.stringify({
    archetypeId: ctx.archetypeId ?? 'arch-1',
    tenantId: ctx.tenantId ?? 'tenant-1',
    userId: 'U123',
    channelId: ctx.channelId ?? 'C123',
    ...(ctx.threadTs === undefined ? {} : { threadTs: ctx.threadTs }),
    text: ctx.text ?? 'run cleaning schedule',
  });
  return { actions: [{ value }], user: { id: 'U123', name: 'testuser' } };
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearPendingInputCollections();
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';

  mockPrismaInstance.archetype.findFirst.mockResolvedValue({
    id: 'arch-1',
    role_name: 'Cleaning Schedule',
    input_schema: [{ key: 'date', label: 'Checkout Date', type: 'date', required: true }],
  });
  mockPrismaInstance.task.create.mockResolvedValue({ id: 'task-123' });
  mockPrismaInstance.task.findFirst.mockResolvedValue(null);
  mockCallLLM.mockResolvedValue({
    content: '',
    model: 'test',
    promptTokens: 0,
    completionTokens: 0,
    estimatedCostUsd: 0,
    latencyMs: 0,
  });
  mockExtractInputsFromText.mockResolvedValue({});
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
});

describe('TRIGGER_CANCEL handler', () => {
  it('valid value with archetypeId → acks and replaces message with cancel notice + archetype context', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getAction('trigger_cancel');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const respond = makeRespond();

    await handler({
      ack,
      body: cancelBody(JSON.stringify({ archetypeId: 'arch-99' })),
      respond,
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledOnce();
    expect(inngest.send).not.toHaveBeenCalled();

    const payload = respond.mock.calls[0][0] as {
      replace_original: boolean;
      text: string;
      blocks: Array<{ type: string; elements?: Array<{ text: string }> }>;
    };
    expect(payload.replace_original).toBe(true);
    expect(payload.text).toContain('Cancelled');
    expect(payload.text).toContain('<@U-CANCEL>');
    const contextBlock = payload.blocks.find((b) => b.type === 'context');
    expect(contextBlock?.elements?.[0]?.text).toContain('arch-99');
  });

  it('no button value → still acks and cancels, omits archetype context block', async () => {
    const { boltApp } = register();
    const handler = boltApp._getAction('trigger_cancel');

    const ack = makeAck();
    const respond = makeRespond();

    await handler({ ack, body: cancelBody(), respond, client: makeClient() });

    expect(ack).toHaveBeenCalledOnce();
    const payload = respond.mock.calls[0][0] as {
      text: string;
      blocks: Array<{ type: string }>;
    };
    expect(payload.text).toContain('Cancelled');
    expect(payload.blocks.some((b) => b.type === 'context')).toBe(false);
  });

  it('malformed JSON value → acks, cancels, no context block (archetypeId falls back to empty)', async () => {
    const { boltApp } = register();
    const handler = boltApp._getAction('trigger_cancel');

    const ack = makeAck();
    const respond = makeRespond();

    await handler({ ack, body: cancelBody('{not-valid-json'), respond, client: makeClient() });

    expect(ack).toHaveBeenCalledOnce();
    const payload = respond.mock.calls[0][0] as { blocks: Array<{ type: string }> };
    expect(payload.blocks.some((b) => b.type === 'context')).toBe(false);
  });

  it('respond rejection → handler does not throw (ack already sent)', async () => {
    const { boltApp } = register();
    const handler = boltApp._getAction('trigger_cancel');

    const ack = makeAck();
    const respond = vi.fn().mockRejectedValue(new Error('expired_url'));

    await expect(
      handler({
        ack,
        body: cancelBody(JSON.stringify({ archetypeId: 'arch-1' })),
        respond,
        client: makeClient(),
      }),
    ).resolves.not.toThrow();
    expect(ack).toHaveBeenCalledOnce();
  });

  it('value with no archetypeId field → cancels without context block', async () => {
    const { boltApp } = register();
    const handler = boltApp._getAction('trigger_cancel');

    const respond = makeRespond();
    await handler({
      ack: makeAck(),
      body: cancelBody(JSON.stringify({ somethingElse: true })),
      respond,
      client: makeClient(),
    });

    const payload = respond.mock.calls[0][0] as { blocks: Array<{ type: string }> };
    expect(payload.blocks.some((b) => b.type === 'context')).toBe(false);
  });
});

describe('TRIGGER_CONFIRM handler — input collection (awaiting-reply window)', () => {
  it('required inputs unextracted → registers a pending collection keyed by threadTs and does not dispatch', async () => {
    const { boltApp, inngest } = register();
    const handler = boltApp._getAction('trigger_confirm');

    const client = makeClient();
    const respond = makeRespond();

    await handler({
      ack: makeAck(),
      body: confirmBody({ threadTs: 'thr.collect-1' }),
      respond,
      client,
    });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(mockPrismaInstance.task.create).not.toHaveBeenCalled();
    expect(pendingInputCollections.has('thr.collect-1')).toBe(true);

    const pending = pendingInputCollections.get('thr.collect-1');
    expect(pending?.archetypeId).toBe('arch-1');
    expect(pending?.tenantId).toBe('tenant-1');
    expect(pending?.text).toBe('run cleaning schedule');

    expect(client.chat.postMessage).toHaveBeenCalledOnce();
    const waitingRespond = respond.mock.calls[respond.mock.calls.length - 1][0] as { text: string };
    expect(waitingRespond.text).toContain('One moment');
  });

  it('no threadTs → falls back to keying the pending collection by the posted message ts', async () => {
    const { boltApp } = register();
    const handler = boltApp._getAction('trigger_confirm');

    const client = makeClient();
    client.chat.postMessage.mockResolvedValue({ ok: true, ts: 'fallback.ts.001' });

    await handler({
      ack: makeAck(),
      body: confirmBody({ threadTs: undefined }),
      respond: makeRespond(),
      client,
    });

    expect(pendingInputCollections.has('fallback.ts.001')).toBe(true);
  });

  it('pending collection stores requiredInputs so the input-collector can re-prompt on timeout', async () => {
    mockPrismaInstance.archetype.findFirst.mockResolvedValue({
      id: 'arch-1',
      role_name: 'Cleaning Schedule',
      input_schema: [
        { key: 'date', label: 'Checkout Date', type: 'date', required: true },
        { key: 'time', label: 'Checkout Time', type: 'time', required: true },
      ],
    });

    const { boltApp } = register();
    const handler = boltApp._getAction('trigger_confirm');

    await handler({
      ack: makeAck(),
      body: confirmBody({ threadTs: 'thr.collect-2' }),
      respond: makeRespond(),
      client: makeClient(),
    });

    const pending = pendingInputCollections.get('thr.collect-2');
    expect(pending?.requiredInputs.map((i) => i.key)).toEqual(['date', 'time']);
  });
});
