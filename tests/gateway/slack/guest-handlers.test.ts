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

function makeTaskFetchReviewing() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue([{ status: 'Reviewing' }]),
  });
}

function makeTaskFetchNotReviewing() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue([{ status: 'Done' }]),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-key';
});

describe('guest_approve handler', () => {
  it('fires employee/approval.received with action: approve when task is Reviewing', async () => {
    vi.stubGlobal('fetch', makeTaskFetchReviewing());

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_approve');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const respond = makeRespond();
    const body = {
      actions: [{ value: 'task-123' }],
      user: { id: 'U-USER', name: 'testuser' },
      channel: { id: 'C-CHAN' },
      message: { ts: '12345.000' },
    };

    await handler({ ack, body, respond, client: makeClient() });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/approval.received',
        data: expect.objectContaining({ taskId: 'task-123', action: 'approve', userId: 'U-USER' }),
        id: 'employee-approval-task-123',
      }),
    );

    vi.unstubAllGlobals();
  });

  it('does not fire inngest.send when task is not in Reviewing state', async () => {
    vi.stubGlobal('fetch', makeTaskFetchNotReviewing());

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_approve');
    const ack = makeAck();
    const respond = makeRespond();

    await handler({
      ack,
      body: {
        actions: [{ value: 'task-already-done' }],
        user: { id: 'U1', name: 'u1' },
        channel: { id: 'C1' },
        message: { ts: 'ts1' },
      },
      respond,
      client: makeClient(),
    });

    expect(inngest.send).not.toHaveBeenCalled();
    expect(respond).toHaveBeenCalledWith(expect.objectContaining({ replace_original: true }));

    vi.unstubAllGlobals();
  });
});

describe('guest_edit handler', () => {
  it('calls client.views.open with guest_edit_modal callback_id', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_edit');
    expect(handler).toBeDefined();

    const ack = makeAck();
    const client = makeClient();
    const editValue = JSON.stringify({ taskId: 'task-edit-1', draftResponse: 'Hello guest.' });

    await handler({
      ack,
      body: {
        actions: [{ value: editValue }],
        user: { id: 'U2', name: 'u2' },
        channel: { id: 'C2' },
        message: { ts: 'ts2' },
        trigger_id: 'trigger-abc',
      },
      respond: makeRespond(),
      client,
    });

    expect(ack).toHaveBeenCalled();
    expect(client.views.open).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_id: 'trigger-abc',
        view: expect.objectContaining({
          callback_id: 'guest_edit_modal',
        }),
      }),
    );
  });

  it('parses taskId and draftResponse from JSON button value and pre-fills modal', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_edit');
    const client = makeClient();
    const editValue = JSON.stringify({
      taskId: 'task-parse-test',
      draftResponse: 'Pre-filled response.',
    });

    await handler({
      ack: makeAck(),
      body: {
        actions: [{ value: editValue }],
        user: { id: 'U3', name: 'u3' },
        channel: { id: 'C3' },
        message: { ts: 'ts3' },
        trigger_id: 'trigger-def',
      },
      respond: makeRespond(),
      client,
    });

    const openCall = client.views.open.mock.calls[0][0] as {
      view: { blocks: Array<{ element?: { initial_value?: string }; block_id?: string }> };
    };
    const inputBlock = openCall.view.blocks.find((b) => b.block_id === 'draft_input');
    expect(inputBlock?.element?.initial_value).toBe('Pre-filled response.');
  });
});

describe('guest_edit_modal view handler', () => {
  it('fires approval event with editedContent when text is valid', async () => {
    vi.stubGlobal('fetch', makeTaskFetchReviewing());

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('guest_edit_modal') as ViewHandler;
    expect(handler).toBeDefined();

    const ack = makeAck();
    const client = makeClient();
    const privateMeta = JSON.stringify({
      taskId: 'task-edit-modal-1',
      channelId: 'C-EDIT',
      messageTs: 'ts-edit',
    });

    await handler({
      ack,
      view: {
        state: {
          values: {
            draft_input: {
              edited_draft: { value: 'Edited response text.' },
            },
          },
        },
        private_metadata: privateMeta,
      },
      body: { user: { id: 'U-EDITOR', name: 'editor' } },
      client,
    });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/approval.received',
        data: expect.objectContaining({
          taskId: 'task-edit-modal-1',
          action: 'approve',
          editedContent: 'Edited response text.',
        }),
        id: 'employee-approval-task-edit-modal-1',
      }),
    );

    vi.unstubAllGlobals();
  });

  it('returns validation error for empty text without calling inngest.send', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('guest_edit_modal') as ViewHandler;
    const ack = makeAck();

    await handler({
      ack,
      view: {
        state: {
          values: {
            draft_input: {
              edited_draft: { value: '   ' },
            },
          },
        },
        private_metadata: JSON.stringify({
          taskId: 'task-empty',
          channelId: 'C1',
          messageTs: 'ts1',
        }),
      },
      body: { user: { id: 'U4', name: 'u4' } },
      client: makeClient(),
    });

    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        response_action: 'errors',
      }),
    );
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

describe('guest_reject handler', () => {
  it('calls client.views.open with guest_reject_modal callback_id', async () => {
    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getAction('guest_reject');
    expect(handler).toBeDefined();

    const client = makeClient();

    await handler({
      ack: makeAck(),
      body: {
        actions: [{ value: 'task-reject-1' }],
        user: { id: 'U5', name: 'u5' },
        channel: { id: 'C5' },
        message: { ts: 'ts5' },
        trigger_id: 'trigger-reject',
      },
      respond: makeRespond(),
      client,
    });

    expect(client.views.open).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger_id: 'trigger-reject',
        view: expect.objectContaining({
          callback_id: 'guest_reject_modal',
        }),
      }),
    );
  });
});

describe('guest_reject_modal view handler', () => {
  it('fires rejection event with rejectionReason when reason is provided', async () => {
    vi.stubGlobal('fetch', makeTaskFetchReviewing());

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('guest_reject_modal') as ViewHandler;
    expect(handler).toBeDefined();

    const privateMeta = JSON.stringify({
      taskId: 'task-reject-modal-1',
      channelId: 'C-REJECT',
      messageTs: 'ts-reject',
    });

    await handler({
      ack: makeAck(),
      view: {
        state: {
          values: {
            reason_input: {
              rejection_reason: { value: 'Response was not accurate.' },
            },
          },
        },
        private_metadata: privateMeta,
      },
      body: { user: { id: 'U-REJECTER', name: 'rejecter' } },
      client: makeClient(),
    });

    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/approval.received',
        data: expect.objectContaining({
          taskId: 'task-reject-modal-1',
          action: 'reject',
          rejectionReason: 'Response was not accurate.',
        }),
      }),
    );

    vi.unstubAllGlobals();
  });

  it('fires rejection event without rejectionReason when reason is omitted', async () => {
    vi.stubGlobal('fetch', makeTaskFetchReviewing());

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('guest_reject_modal') as ViewHandler;
    const privateMeta = JSON.stringify({
      taskId: 'task-reject-no-reason',
      channelId: 'C-REJECT2',
      messageTs: 'ts-reject2',
    });

    await handler({
      ack: makeAck(),
      view: {
        state: {
          values: {
            reason_input: {
              rejection_reason: { value: null },
            },
          },
        },
        private_metadata: privateMeta,
      },
      body: { user: { id: 'U-NOREJECTER', name: 'norejecter' } },
      client: makeClient(),
    });

    expect(inngest.send).toHaveBeenCalled();
    const sentData = inngest.send.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(sentData.data).not.toHaveProperty('rejectionReason');

    vi.unstubAllGlobals();
  });

  it('does not fire inngest.send when task is not Reviewing', async () => {
    vi.stubGlobal('fetch', makeTaskFetchNotReviewing());

    const boltApp = makeMockBoltApp();
    const inngest = makeMockInngest();
    registerSlackHandlers(boltApp as unknown as App, inngest);

    const handler = boltApp._getView('guest_reject_modal') as ViewHandler;

    await handler({
      ack: makeAck(),
      view: {
        state: { values: { reason_input: { rejection_reason: { value: null } } } },
        private_metadata: JSON.stringify({ taskId: 'task-already-done' }),
      },
      body: { user: { id: 'U6', name: 'u6' } },
      client: makeClient(),
    });

    expect(inngest.send).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
