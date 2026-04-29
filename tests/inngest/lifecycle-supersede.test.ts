import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { createEmployeeLifecycleFunction } from '../../src/inngest/employee-lifecycle.js';

// vi.hoisted() is required so these references are available inside vi.mock()
// factories, which Vitest hoists above all import statements at transpile time.
const {
  mockGetPendingApproval,
  mockTrackPendingApproval,
  mockClearPendingApproval,
  mockClearPendingApprovalByTaskId,
  mockCreateMachine,
  mockDestroyMachine,
  mockGetTunnelUrl,
  mockUpdateMessage,
  mockCreateSlackClient,
  mockLoadTenantEnv,
} = vi.hoisted(() => ({
  mockGetPendingApproval: vi.fn(),
  mockTrackPendingApproval: vi.fn(),
  mockClearPendingApproval: vi.fn(),
  mockClearPendingApprovalByTaskId: vi.fn(),
  mockCreateMachine: vi.fn(),
  mockDestroyMachine: vi.fn(),
  mockGetTunnelUrl: vi.fn(),
  mockUpdateMessage: vi.fn(),
  mockCreateSlackClient: vi.fn(),
  mockLoadTenantEnv: vi.fn(),
}));

vi.mock('../../src/inngest/lib/pending-approvals.js', () => ({
  getPendingApproval: mockGetPendingApproval,
  trackPendingApproval: mockTrackPendingApproval,
  clearPendingApproval: mockClearPendingApproval,
  clearPendingApprovalByTaskId: mockClearPendingApprovalByTaskId,
}));

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

const TEST_TASK_ID = '33333333-3333-3333-3333-333333333333';
const TEST_OLD_TASK_ID = '44444444-4444-4444-4444-444444444444';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';
const CONVERSATION_REF = 'thread-hostfully-abc123';
const OLD_SLACK_TS = 'msg-ts-old.000001';
const OLD_CHANNEL = 'C-CHANNEL-OLD-999';

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

function makeEngine(opts: {
  inngest: Inngest;
  runCheckSupersede?: boolean;
  runTrackPending?: boolean;
}) {
  return new InngestTestEngine({
    function: createEmployeeLifecycleFunction(opts.inngest),
    transformCtx: (ctx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mocked = mockCtx(ctx as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mocked as any).step.waitForEvent = vi.fn().mockResolvedValue(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mocked as any).step.run = vi
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
              return { skipApproval: false };
            case 'check-supersede':
              return opts.runCheckSupersede !== false ? fn() : undefined;
            case 'set-reviewing':
              return undefined;
            case 'track-pending-approval':
              return opts.runTrackPending === true ? fn() : undefined;
            default:
              return undefined;
          }
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mocked as any;
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateMachine.mockResolvedValue({ id: 'mock-delivery-machine-id' });
  mockDestroyMachine.mockResolvedValue(undefined);
  mockGetTunnelUrl.mockResolvedValue('http://mock-tunnel.trycloudflare.com');
  mockUpdateMessage.mockResolvedValue({});
  mockCreateSlackClient.mockReturnValue({
    updateMessage: mockUpdateMessage,
    postMessage: vi.fn().mockResolvedValue({}),
  });
  mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test-bot-token' });

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

describe('lifecycle — check-supersede step', () => {
  it('happy path: supersedes old task when conversation_ref present and old task is Reviewing', async () => {
    const inngest = new Inngest({ id: 'ai-employee-test-supersede-1' });
    const sendSpy = vi.spyOn(inngest as any, 'send').mockResolvedValue({ ids: ['event-1'] });

    mockGetPendingApproval.mockResolvedValue({
      id: 'pending-id-1',
      tenantId: TEST_TENANT_ID,
      threadUid: CONVERSATION_REF,
      taskId: TEST_OLD_TASK_ID,
      slackTs: OLD_SLACK_TS,
      channelId: OLD_CHANNEL,
      createdAt: '2026-04-28T00:00:00Z',
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (
        (url as string).includes('/deliverables?') &&
        (url as string).includes('select=metadata')
      ) {
        return makeOkFetchResponse([
          {
            metadata: {
              conversation_ref: CONVERSATION_REF,
              approval_message_ts: OLD_SLACK_TS,
              target_channel: OLD_CHANNEL,
            },
          },
        ]);
      }
      if ((url as string).includes('/tasks?id=eq.') && (url as string).includes('select=status')) {
        return makeOkFetchResponse([{ status: 'Reviewing' }]);
      }
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = makeEngine({ inngest });
    await engine.execute(triggerEvent());

    expect(mockGetPendingApproval).toHaveBeenCalledWith(
      'http://localhost:54321',
      'test-supabase-key',
      TEST_TENANT_ID,
      CONVERSATION_REF,
    );

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/approval.received',
        data: expect.objectContaining({
          taskId: TEST_OLD_TASK_ID,
          action: 'superseded',
          userId: 'system',
        }),
      }),
    );

    expect(mockUpdateMessage).toHaveBeenCalledWith(
      OLD_CHANNEL,
      OLD_SLACK_TS,
      expect.any(String),
      expect.any(Array),
    );
  });

  it('race condition: clears stale entry and does NOT supersede when old task is already Approved', async () => {
    const inngest = new Inngest({ id: 'ai-employee-test-supersede-2' });
    const sendSpy = vi.spyOn(inngest as any, 'send').mockResolvedValue({ ids: [] });

    mockGetPendingApproval.mockResolvedValue({
      id: 'pending-id-2',
      tenantId: TEST_TENANT_ID,
      threadUid: CONVERSATION_REF,
      taskId: TEST_OLD_TASK_ID,
      slackTs: 'msg-ts-race.000002',
      channelId: 'C-CHANNEL-RACE',
      createdAt: '2026-04-28T01:00:00Z',
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (
        (url as string).includes('/deliverables?') &&
        (url as string).includes('select=metadata')
      ) {
        return makeOkFetchResponse([{ metadata: { conversation_ref: CONVERSATION_REF } }]);
      }
      if ((url as string).includes('/tasks?id=eq.') && (url as string).includes('select=status')) {
        return makeOkFetchResponse([{ status: 'Approved' }]);
      }
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = makeEngine({ inngest });
    await engine.execute(triggerEvent());

    expect(sendSpy).not.toHaveBeenCalled();
    expect(mockUpdateMessage).not.toHaveBeenCalled();
    expect(mockClearPendingApproval).toHaveBeenCalledWith(
      'http://localhost:54321',
      'test-supabase-key',
      TEST_TENANT_ID,
      CONVERSATION_REF,
    );
  });

  it('skips superseding entirely when conversation_ref is absent from deliverable metadata', async () => {
    const inngest = new Inngest({ id: 'ai-employee-test-supersede-3' });
    const sendSpy = vi.spyOn(inngest as any, 'send').mockResolvedValue({ ids: [] });

    const fetchMock = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (
        (url as string).includes('/deliverables?') &&
        (url as string).includes('select=metadata')
      ) {
        return makeOkFetchResponse([{ metadata: { approval_message_ts: 'ts-999' } }]);
      }
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = makeEngine({ inngest });
    await engine.execute(triggerEvent());

    expect(mockGetPendingApproval).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('skips superseding when getPendingApproval returns null (no prior pending task)', async () => {
    const inngest = new Inngest({ id: 'ai-employee-test-supersede-4' });
    const sendSpy = vi.spyOn(inngest as any, 'send').mockResolvedValue({ ids: [] });

    mockGetPendingApproval.mockResolvedValue(null);

    const fetchMock = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (
        (url as string).includes('/deliverables?') &&
        (url as string).includes('select=metadata')
      ) {
        return makeOkFetchResponse([{ metadata: { conversation_ref: CONVERSATION_REF } }]);
      }
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = makeEngine({ inngest });
    await engine.execute(triggerEvent());

    expect(mockGetPendingApproval).toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('self-reference guard: skips superseding when pending task ID equals current task ID', async () => {
    const inngest = new Inngest({ id: 'ai-employee-test-supersede-5' });
    const sendSpy = vi.spyOn(inngest as any, 'send').mockResolvedValue({ ids: [] });

    mockGetPendingApproval.mockResolvedValue({
      id: 'pending-id-self',
      tenantId: TEST_TENANT_ID,
      threadUid: CONVERSATION_REF,
      taskId: TEST_TASK_ID,
      slackTs: 'msg-ts-self.000003',
      channelId: 'C-SELF-REF',
      createdAt: '2026-04-28T02:00:00Z',
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (
        (url as string).includes('/deliverables?') &&
        (url as string).includes('select=metadata')
      ) {
        return makeOkFetchResponse([{ metadata: { conversation_ref: CONVERSATION_REF } }]);
      }
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = makeEngine({ inngest });
    await engine.execute(triggerEvent());

    expect(sendSpy).not.toHaveBeenCalled();
    expect(mockUpdateMessage).not.toHaveBeenCalled();
  });
});

describe('lifecycle — track-pending-approval step', () => {
  it('calls trackPendingApproval with correct data when all metadata fields are present', async () => {
    const inngest = new Inngest({ id: 'ai-employee-test-track-1' });
    vi.spyOn(inngest as any, 'send').mockResolvedValue({ ids: [] });

    mockGetPendingApproval.mockResolvedValue(null);

    const APPROVAL_TS = 'approval-msg-ts.000001';
    const TARGET_CHAN = 'C-TARGET-TRACKING-555';

    const fetchMock = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (
        (url as string).includes('/deliverables?') &&
        (url as string).includes('select=metadata')
      ) {
        return makeOkFetchResponse([
          {
            metadata: {
              conversation_ref: CONVERSATION_REF,
              approval_message_ts: APPROVAL_TS,
              target_channel: TARGET_CHAN,
            },
          },
        ]);
      }
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = makeEngine({ inngest, runTrackPending: true });
    await engine.execute(triggerEvent());

    expect(mockTrackPendingApproval).toHaveBeenCalledWith(
      'http://localhost:54321',
      'test-supabase-key',
      {
        tenantId: TEST_TENANT_ID,
        threadUid: CONVERSATION_REF,
        taskId: TEST_TASK_ID,
        slackTs: APPROVAL_TS,
        channelId: TARGET_CHAN,
      },
    );
  });

  it('does NOT call trackPendingApproval when conversation_ref is missing from metadata', async () => {
    const inngest = new Inngest({ id: 'ai-employee-test-track-2' });
    vi.spyOn(inngest as any, 'send').mockResolvedValue({ ids: [] });

    const fetchMock = vi.fn().mockImplementation(async (url: string, _init?: RequestInit) => {
      if (
        (url as string).includes('/deliverables?') &&
        (url as string).includes('select=metadata')
      ) {
        return makeOkFetchResponse([{ metadata: { approval_message_ts: 'ts-999' } }]);
      }
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const engine = makeEngine({ inngest, runCheckSupersede: false, runTrackPending: true });
    await engine.execute(triggerEvent());

    expect(mockTrackPendingApproval).not.toHaveBeenCalled();
  });
});
