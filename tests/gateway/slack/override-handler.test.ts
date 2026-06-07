import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

function makeTaskFetchStatus(status: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue([{ status }]),
  });
}

function makeTaskFetchEmpty() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue([]),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('override_take_action handler', () => {
  it('opens override_take_action_modal when task is non-terminal', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('override_take_action');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const client = makeClient();
    const body = {
      actions: [{ value: 'test-task-id' }],
      user: { id: 'U123', name: 'testuser' },
      channel: { id: 'C-CHAN' },
      message: { ts: '12345.000' },
      trigger_id: 'trigger-abc',
    };

    await handler({ ack, body, respond: vi.fn(), client });

    expect(ack).toHaveBeenCalledWith();
    expect(client.views.open).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_id: 'trigger-abc',
        view: expect.objectContaining({
          callback_id: 'override_take_action_modal',
          private_metadata: JSON.stringify({
            taskId: 'test-task-id',
            channelId: 'C-CHAN',
            messageTs: '12345.000',
          }),
        }),
      }),
    );
  });

  it('calls plain ack and skips modal when taskId is missing', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('override_take_action');
    const ack = makeAck();
    const client = makeClient();

    await handler({
      ack,
      body: {
        actions: [{ value: '' }],
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
        trigger_id: 'trigger-abc',
      },
      respond: vi.fn(),
      client,
    });

    expect(ack).toHaveBeenCalledWith();
    expect(client.views.open).not.toHaveBeenCalled();
  });
});

describe('override_dismiss handler', () => {
  it('sends employee/override.requested with direction null', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('override_dismiss');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const body = {
      actions: [{ value: 'test-task-id' }],
      user: { id: 'U123', name: 'testuser' },
      channel: { id: 'C-CHAN' },
      message: { ts: '12345.000' },
    };

    await handler({ ack, body, respond: vi.fn(), client: makeClient() });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/override.requested',
        data: expect.objectContaining({
          taskId: 'test-task-id',
          direction: null,
          userId: 'U123',
          userName: 'testuser',
        }),
        id: 'employee-override-dismiss-test-task-id',
      }),
    );
  });

  it('ack includes replace_original with dismissed message', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('override_dismiss');
    const ack = makeAck();

    await handler({
      ack,
      body: {
        actions: [{ value: 'test-task-id' }],
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond: vi.fn(),
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        replace_original: true,
        text: expect.stringContaining('Dismissed'),
      }),
    );
  });

  it('calls plain ack and skips event when taskId is missing', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('override_dismiss');
    const ack = makeAck();

    await handler({
      ack,
      body: {
        actions: [{ value: '' }],
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond: vi.fn(),
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledWith();
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

describe('override_take_action_modal view handler', () => {
  it('sends employee/override.requested with direction when valid input submitted', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Submitting'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('override_take_action_modal');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const client = makeClient();

    await handler({
      ack,
      view: {
        state: {
          values: { direction_input: { direction_text: { value: 'Send a welcome message' } } },
        },
        private_metadata: JSON.stringify({
          taskId: 'test-task-id',
          channelId: 'C-CHAN',
          messageTs: 'ts1',
        }),
      },
      body: { user: { id: 'U123', name: 'testuser' } },
      client,
    });

    expect(ack).toHaveBeenCalledWith();
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/override.requested',
        data: expect.objectContaining({
          taskId: 'test-task-id',
          direction: 'Send a welcome message',
          userId: 'U123',
          userName: 'testuser',
        }),
        id: 'employee-override-test-task-id',
      }),
    );
  });

  it('returns validation error when direction is empty', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('override_take_action_modal');
    const ack = makeAck();

    await handler({
      ack,
      view: {
        state: { values: { direction_input: { direction_text: { value: '' } } } },
        private_metadata: JSON.stringify({
          taskId: 'test-task-id',
          channelId: 'C1',
          messageTs: 'ts1',
        }),
      },
      body: { user: { id: 'U123', name: 'testuser' } },
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        response_action: 'errors',
        errors: expect.objectContaining({ direction_input: expect.any(String) }),
      }),
    );
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('does not send event when task is already resolved (terminal state)', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Done'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('override_take_action_modal');

    await handler({
      ack: makeAck(),
      view: {
        state: { values: { direction_input: { direction_text: { value: 'Do something' } } } },
        private_metadata: JSON.stringify({
          taskId: 'test-task-id',
          channelId: 'C1',
          messageTs: 'ts1',
        }),
      },
      body: { user: { id: 'U123', name: 'testuser' } },
      client: makeClient(),
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('does not send event when task is not found', async () => {
    vi.stubGlobal('fetch', makeTaskFetchEmpty());

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('override_take_action_modal');

    await handler({
      ack: makeAck(),
      view: {
        state: { values: { direction_input: { direction_text: { value: 'Do something' } } } },
        private_metadata: JSON.stringify({
          taskId: 'missing-task-id',
          channelId: 'C1',
          messageTs: 'ts1',
        }),
      },
      body: { user: { id: 'U123', name: 'testuser' } },
      client: makeClient(),
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('updates message to processing state after sending event', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Submitting'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('override_take_action_modal');
    const client = makeClient();

    await handler({
      ack: makeAck(),
      view: {
        state: { values: { direction_input: { direction_text: { value: 'Do something' } } } },
        private_metadata: JSON.stringify({
          taskId: 'test-task-id',
          channelId: 'C-CHAN',
          messageTs: 'ts-msg',
        }),
      },
      body: { user: { id: 'U123', name: 'testuser' } },
      client,
    });

    expect(client.chat.update).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C-CHAN',
        ts: 'ts-msg',
        text: expect.stringContaining('On it — working on your direction'),
      }),
    );
  });
});
