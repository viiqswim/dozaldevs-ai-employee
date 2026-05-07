import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { createEmployeeLifecycleFunction } from '../../src/inngest/employee-lifecycle.js';

const {
  mockCreateMachine,
  mockDestroyMachine,
  mockGetTunnelUrl,
  mockUpdateMessage,
  mockPostMessage,
  mockCreateSlackClient,
  mockLoadTenantEnv,
} = vi.hoisted(() => {
  const mockCreateMachine = vi.fn();
  const mockDestroyMachine = vi.fn();
  const mockGetTunnelUrl = vi.fn();
  const mockUpdateMessage = vi.fn();
  const mockPostMessage = vi.fn();
  const mockCreateSlackClient = vi.fn();
  const mockLoadTenantEnv = vi.fn();
  return {
    mockCreateMachine,
    mockDestroyMachine,
    mockGetTunnelUrl,
    mockUpdateMessage,
    mockPostMessage,
    mockCreateSlackClient,
    mockLoadTenantEnv,
  };
});

vi.mock('../../src/lib/fly-client.js', () => ({
  createMachine: mockCreateMachine,
  destroyMachine: mockDestroyMachine,
}));

vi.mock('../../src/lib/tunnel-client.js', () => ({
  getTunnelUrl: mockGetTunnelUrl,
}));

vi.mock('../../src/lib/slack-client.js', () => ({
  createSlackClient: mockCreateSlackClient,
}));

vi.mock('../../src/gateway/services/tenant-env-loader.js', () => ({
  loadTenantEnv: mockLoadTenantEnv,
}));

vi.mock('../../src/gateway/services/tenant-repository.js', () => ({
  TenantRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/gateway/services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
  Prisma: { JsonNull: 'JsonNull' },
}));

const TEST_TASK_ID = '44444444-4444-4444-4444-444444444444';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';

const NO_ACTION_CONTENT = JSON.stringify({
  classification: 'NO_ACTION_NEEDED',
  confidence: 0.95,
  reasoning: 'Guest said thanks',
  draftResponse: null,
  summary: 'Acknowledgment',
  category: 'acknowledgment',
  conversationSummary: null,
  urgency: false,
  guestName: 'Jane Doe',
  propertyName: 'Ocean Villa',
  checkIn: '2026-06-01',
  checkOut: '2026-06-07',
  bookingChannel: 'airbnb',
  originalMessage: 'Thanks so much!',
  leadUid: 'lead-abc',
  threadUid: 'thread-abc',
  messageUid: 'msg-abc',
});

const inngest = new Inngest({ id: 'ai-employee-test-override' });

function makeMockTaskData() {
  return {
    id: TEST_TASK_ID,
    tenant_id: TEST_TENANT_ID,
    status: 'Ready',
    archetypes: {
      id: TEST_ARCHETYPE_ID,
      risk_model: { approval_required: true, timeout_hours: 24 },
      runtime: 'opencode',
      model: 'minimax/minimax-m2.7',
    },
  };
}

function makeOkFetchResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
}

function buildFetchMock(opts: { deliverableContent?: string | null } = {}) {
  const { deliverableContent = NO_ACTION_CONTENT } = opts;

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if (method === 'PATCH' || method === 'POST') {
      return makeOkFetchResponse([{ id: 'new-task-id-123' }]);
    }

    if ((url as string).includes('/tasks?') && (url as string).includes('select=status')) {
      return makeOkFetchResponse([{ status: 'Submitting' }]);
    }

    if ((url as string).includes('/deliverables?')) {
      if (deliverableContent === null) return makeOkFetchResponse([]);
      return makeOkFetchResponse([{ content: deliverableContent }]);
    }

    return makeOkFetchResponse([]);
  });
}

function findPatchWithStatus(
  fetchMock: ReturnType<typeof vi.fn>,
  status: string,
): [string, RequestInit | undefined] | undefined {
  return (fetchMock.mock.calls as Array<[string, RequestInit | undefined]>)
    .filter(
      ([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase() === 'PATCH',
    )
    .find(([, init]) => {
      try {
        const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
          status?: string;
        };
        return body.status === status;
      } catch {
        return false;
      }
    });
}

function triggerEvent(): { events: [{ name: string; data: Record<string, unknown> }] } {
  return {
    events: [
      {
        name: 'employee/task.dispatched',
        data: { taskId: TEST_TASK_ID, archetypeId: TEST_ARCHETYPE_ID },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMachine.mockResolvedValue({ id: 'mock-machine-id' });
  mockDestroyMachine.mockResolvedValue(undefined);
  mockGetTunnelUrl.mockResolvedValue('http://mock-tunnel.trycloudflare.com');
  mockUpdateMessage.mockResolvedValue({});
  mockPostMessage.mockResolvedValue({ ts: 'override-card-ts', channel: 'C-NOTIFY' });
  mockCreateSlackClient.mockReturnValue({
    updateMessage: mockUpdateMessage,
    postMessage: mockPostMessage,
  });
  mockLoadTenantEnv.mockResolvedValue({
    SLACK_BOT_TOKEN: 'xoxb-test-bot-token',
    NOTIFICATION_CHANNEL: 'C-NOTIFY',
  });

  vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });

  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SECRET_KEY = 'test-supabase-key';
  process.env.FLY_WORKER_APP = 'ai-employee-workers';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.FLY_WORKER_APP;
});

describe('employee-lifecycle — generic override flow (NO_ACTION_NEEDED)', () => {
  it('timeout path — task patched to Done, no new machine spawned', async () => {
    const fetchMock = buildFetchMock({});
    vi.stubGlobal('fetch', fetchMock);

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeMockTaskData();
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return fn();
          case 'cleanup-no-action':
            return fn();
          case 'post-override-card':
            return fn();
          case 'complete-no-action-timeout':
            return fn();
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockResolvedValue(null);

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mocked = mockCtx(ctx as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mocked as any).step.run = stepRunMock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mocked as any).step.waitForEvent = waitForEventMock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mocked as any;
      },
    });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(findPatchWithStatus(fetchMock, 'Done')).toBeDefined();
    expect(waitForEventMock).toHaveBeenCalledWith(
      'wait-for-override',
      expect.objectContaining({ event: 'employee/override.requested' }),
    );
    expect(mockCreateMachine).not.toHaveBeenCalledTimes(2);
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(false);
  });

  it('dismiss path — direction null → task patched to Done, no new task created', async () => {
    const fetchMock = buildFetchMock({});
    vi.stubGlobal('fetch', fetchMock);

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeMockTaskData();
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return fn();
          case 'cleanup-no-action':
            return fn();
          case 'post-override-card':
            return fn();
          case 'complete-override-dismissed':
            return fn();
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'wait-for-override') {
        return {
          name: 'employee/override.requested',
          data: { taskId: TEST_TASK_ID, direction: null, userId: 'U123', userName: 'testuser' },
        };
      }
      return null;
    });

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mocked = mockCtx(ctx as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mocked as any).step.run = stepRunMock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mocked as any).step.waitForEvent = waitForEventMock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mocked as any;
      },
    });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(findPatchWithStatus(fetchMock, 'Done')).toBeDefined();
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(
        ([id]) => id === 'create-override-task',
      ),
    ).toBe(false);
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(false);
  });

  it('take-action path — direction provided → new linked task created via PostgREST POST', async () => {
    const fetchMock = buildFetchMock({});
    vi.stubGlobal('fetch', fetchMock);

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeMockTaskData();
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return fn();
          case 'cleanup-no-action':
            return fn();
          case 'post-override-card':
            return fn();
          case 'create-override-task':
            return fn();
          default:
            return undefined;
        }
      });

    vi.spyOn(inngest, 'send').mockResolvedValue({ ids: ['mock-dispatch-id'] } as never);

    const waitForEventMock = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'wait-for-override') {
        return {
          name: 'employee/override.requested',
          data: {
            taskId: TEST_TASK_ID,
            direction: 'Please send a welcome message',
            userId: 'U123',
            userName: 'testuser',
          },
        };
      }
      return null;
    });

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mocked = mockCtx(ctx as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mocked as any).step.run = stepRunMock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mocked as any).step.waitForEvent = waitForEventMock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mocked as any;
      },
    });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();

    const postCalls = (fetchMock.mock.calls as Array<[string, RequestInit | undefined]>).filter(
      ([, init]) => ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase() === 'POST',
    );
    const taskPostCall = postCalls.find(([url]) => (url as string).includes('/rest/v1/tasks'));
    expect(taskPostCall).toBeDefined();

    if (taskPostCall) {
      const body = JSON.parse((taskPostCall[1]?.body as string) ?? '{}') as {
        source_system?: string;
        metadata?: { override_direction?: string };
      };
      expect(body.source_system).toBe('override');
      expect(body.metadata?.override_direction).toBe('Please send a welcome message');
    }

    expect(findPatchWithStatus(fetchMock, 'Done')).toBeDefined();
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(false);
  });

  it('waitForEvent uses employee/override.requested event name', async () => {
    const fetchMock = buildFetchMock({});
    vi.stubGlobal('fetch', fetchMock);

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeMockTaskData();
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return fn();
          case 'cleanup-no-action':
            return fn();
          case 'post-override-card':
            return fn();
          case 'complete-no-action-timeout':
            return fn();
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockResolvedValue(null);

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx: unknown) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mocked = mockCtx(ctx as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mocked as any).step.run = stepRunMock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mocked as any).step.waitForEvent = waitForEventMock;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return mocked as any;
      },
    });

    await engine.execute(triggerEvent());

    expect(waitForEventMock).toHaveBeenCalledWith(
      'wait-for-override',
      expect.objectContaining({ event: 'employee/override.requested', match: 'data.taskId' }),
    );
    const waitCalls = waitForEventMock.mock.calls as Array<[string, unknown]>;
    expect(waitCalls.some(([id]) => id === 'wait-for-reply-anyway')).toBe(false);
  });
});
