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

const REPLY_CONTEXT_STRING = JSON.stringify({
  guestName: 'Jane Doe',
  propertyName: 'Ocean Villa',
  checkIn: '2026-06-01',
  checkOut: '2026-06-07',
  bookingChannel: 'airbnb',
  originalMessage: 'Thanks so much!',
  summary: 'Acknowledgment',
  leadUid: 'lead-abc',
  threadUid: 'thread-abc',
  messageUid: 'msg-abc',
  conversationSummary: '',
});

const inngest = new Inngest({ id: 'ai-employee-test-reply-anyway' });

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

function buildFetchMock(opts: {
  taskMetadata?: Record<string, unknown> | null;
  deliverableContent?: string | null;
  statusForPoll?: string;
}) {
  const {
    taskMetadata = null,
    deliverableContent = NO_ACTION_CONTENT,
    statusForPoll = 'Submitting',
  } = opts;

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if (method === 'PATCH' || method === 'POST') {
      return makeOkFetchResponse([]);
    }

    if ((url as string).includes('/tasks?') && (url as string).includes('select=metadata')) {
      if (taskMetadata !== null) {
        return makeOkFetchResponse([{ metadata: taskMetadata }]);
      }
      return makeOkFetchResponse([{ metadata: null }]);
    }

    if ((url as string).includes('/tasks?') && (url as string).includes('select=status')) {
      return makeOkFetchResponse([{ status: statusForPoll }]);
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
  mockPostMessage.mockResolvedValue({});
  mockCreateSlackClient.mockReturnValue({
    updateMessage: mockUpdateMessage,
    postMessage: mockPostMessage,
  });
  mockLoadTenantEnv.mockResolvedValue({
    SLACK_BOT_TOKEN: 'xoxb-test-bot-token',
    SUMMARY_TARGET_CHANNEL: 'C-FALLBACK',
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

describe('employee-lifecycle — Reply Anyway wait window (NO_ACTION_NEEDED)', () => {
  it('timeout path — task patched to Done, re-draft machine NOT spawned', async () => {
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
      'wait-for-reply-anyway',
      expect.objectContaining({ event: 'employee/reply-anyway.requested' }),
    );
    expect(mockCreateMachine).not.toHaveBeenCalled();
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(false);
  });

  it('click path — re-draft machine spawned with REPLY_ANYWAY_CONTEXT env var', async () => {
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
          case 'build-reply-context':
            return REPLY_CONTEXT_STRING;
          case 'reply-anyway-execute':
            return fn();
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'wait-for-reply-anyway') {
        return {
          name: 'employee/reply-anyway.requested',
          data: { taskId: TEST_TASK_ID, userId: 'U123', userName: 'testuser' },
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
    expect(waitForEventMock).toHaveBeenCalledWith(
      'wait-for-reply-anyway',
      expect.objectContaining({ event: 'employee/reply-anyway.requested' }),
    );
    expect(mockCreateMachine).toHaveBeenCalledTimes(1);
    const firstCall = mockCreateMachine.mock.calls[0] as [string, Record<string, unknown>];
    const machineConfig = firstCall[1] as { env?: Record<string, string> };
    expect(machineConfig.env?.REPLY_ANYWAY_CONTEXT).toBe(REPLY_CONTEXT_STRING);
    expect(machineConfig.env?.TASK_ID).toBe(TEST_TASK_ID);
  });

  it('re-draft machine failure — task remains Failed, no fall-through to set-reviewing', async () => {
    const fetchMock = buildFetchMock({ statusForPoll: 'Failed' });
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
          case 'build-reply-context':
            return REPLY_CONTEXT_STRING;
          case 'reply-anyway-execute':
            return fn();
          case 'reply-anyway-poll':
            return 'Failed';
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockImplementation(async (id: string) => {
      if (id === 'wait-for-reply-anyway') {
        return {
          name: 'employee/reply-anyway.requested',
          data: { taskId: TEST_TASK_ID, userId: 'U123', userName: 'testuser' },
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
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(false);
    expect(findPatchWithStatus(fetchMock, 'Reviewing')).toBeUndefined();
  });

  it('infinite loop guard — reply_anyway metadata forces skipApproval=false, no reply-anyway wait', async () => {
    const fetchMock = buildFetchMock({
      taskMetadata: { reply_anyway: true, overridden_no_action: true },
      deliverableContent: NO_ACTION_CONTENT,
    });
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
    const waitForEventCalls = waitForEventMock.mock.calls as Array<[string, unknown]>;
    expect(waitForEventCalls.some(([id]) => id === 'wait-for-reply-anyway')).toBe(false);
    expect(waitForEventCalls.some(([id]) => id === 'wait-for-approval')).toBe(true);
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(true);
  });
});
