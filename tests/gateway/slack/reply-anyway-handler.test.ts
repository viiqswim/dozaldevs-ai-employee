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

function makeRespond() {
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

describe('guest_reply_anyway handler', () => {
  it('sends employee/reply-anyway.requested event when task is non-terminal', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Submitting'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reply_anyway');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const respond = makeRespond();
    const body = {
      actions: [{ value: 'test-task-id' }],
      user: { id: 'U123', name: 'testuser' },
      channel: { id: 'C-CHAN' },
      message: { ts: '12345.000' },
    };

    await handler({ ack, body, respond, client: makeClient() });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/reply-anyway.requested',
        data: expect.objectContaining({
          taskId: 'test-task-id',
          userId: 'U123',
          userName: 'testuser',
        }),
        id: 'employee-reply-anyway-test-task-id',
      }),
    );
  });

  it('does not send event and responds with already-resolved when task is Done', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Done'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reply_anyway');
    const ack = makeAck();
    const respond = makeRespond();

    await handler({
      ack,
      body: {
        actions: [{ value: 'test-task-id' }],
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond,
      client: makeClient(),
    });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        replace_original: true,
        text: expect.stringContaining('already been resolved'),
      }),
    );
  });

  it('does not send event when task is in Failed state', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Failed'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reply_anyway');

    await handler({
      ack: makeAck(),
      body: {
        actions: [{ value: 'task-failed' }],
        user: { id: 'U1', name: 'u1' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond: makeRespond(),
      client: makeClient(),
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('does not send event when task is in Cancelled state', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Cancelled'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reply_anyway');

    await handler({
      ack: makeAck(),
      body: {
        actions: [{ value: 'task-cancelled' }],
        user: { id: 'U1', name: 'u1' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond: makeRespond(),
      client: makeClient(),
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('calls ack immediately with processing state blocks', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Submitting'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reply_anyway');
    const ack = makeAck();

    await handler({
      ack,
      body: {
        actions: [{ value: 'test-task-id' }],
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond: makeRespond(),
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        replace_original: true,
        text: '⏳ Processing Reply Anyway...',
        blocks: expect.arrayContaining([
          expect.objectContaining({ type: 'section' }),
          expect.objectContaining({ type: 'context' }),
        ]),
      }),
    );
  });

  it('missing taskId causes early return with plain ack and no inngest.send', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reply_anyway');
    const ack = makeAck();

    await handler({
      ack,
      body: {
        actions: [{ value: '' }],
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond: makeRespond(),
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledWith();
    expect(inngest.send).not.toHaveBeenCalled();
  });

  it('inngest dedup ID format matches employee-reply-anyway-{taskId}', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Executing'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reply_anyway');

    await handler({
      ack: makeAck(),
      body: {
        actions: [{ value: 'test-task-id' }],
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond: makeRespond(),
      client: makeClient(),
    });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'employee-reply-anyway-test-task-id',
      }),
    );
  });

  it('restores NO_ACTION_BUTTON_BLOCKS when inngest.send throws', async () => {
    vi.stubGlobal('fetch', makeTaskFetchStatus('Submitting'));

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    inngest.send.mockRejectedValueOnce(new Error('Inngest failure'));
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reply_anyway');
    const respond = makeRespond();

    await handler({
      ack: makeAck(),
      body: {
        actions: [{ value: 'test-task-id' }],
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond,
      client: makeClient(),
    });

    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        replace_original: true,
        blocks: expect.arrayContaining([
          expect.objectContaining({
            type: 'actions',
            elements: expect.arrayContaining([
              expect.objectContaining({ action_id: 'guest_reply_anyway' }),
            ]),
          }),
        ]),
      }),
    );
  });

  it('handles empty task array from PostgREST gracefully without sending event', async () => {
    vi.stubGlobal('fetch', makeTaskFetchEmpty());

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reply_anyway');

    await handler({
      ack: makeAck(),
      body: {
        actions: [{ value: 'missing-task-id' }],
        user: { id: 'U123', name: 'testuser' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond: makeRespond(),
      client: makeClient(),
    });

    expect(inngest.send).not.toHaveBeenCalled();
  });
});
