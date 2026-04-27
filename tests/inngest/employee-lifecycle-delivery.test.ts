import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { createEmployeeLifecycleFunction } from '../../src/inngest/employee-lifecycle.js';

// vi.hoisted() is required so these references are available inside vi.mock()
// factories, which Vitest hoists above all import statements at transpile time.
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

const TEST_TASK_ID = '11111111-1111-1111-1111-111111111111';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';
const APPROVAL_MSG_TS = 'msg-ts-12345.000100';
const TARGET_CHANNEL = 'C-TARGET-12345';

const inngest = new Inngest({ id: 'ai-employee-test-delivery' });

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

function makeApprovalEvent(action: 'approve' | 'reject' = 'approve', userId = 'U123456') {
  return {
    name: 'employee/approval.received',
    data: { taskId: TEST_TASK_ID, action, userId },
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

function buildFetchMock(
  opts: {
    deliveryInstructions?: string | null;
    taskStatuses?: string[];
    skipDeliverable?: boolean;
  } = {},
): ReturnType<typeof vi.fn> {
  let pollIdx = 0;
  const statuses = opts.taskStatuses ?? ['Done'];

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if ((url as string).includes('/deliverables?')) {
      if (opts.skipDeliverable) return makeOkFetchResponse([]);
      return makeOkFetchResponse([
        {
          metadata: { approval_message_ts: APPROVAL_MSG_TS, target_channel: TARGET_CHANNEL },
          content: "Today's channel summary content",
          external_ref: TEST_TASK_ID,
        },
      ]);
    }

    if ((url as string).includes('archetypes(delivery_instructions)')) {
      const di =
        'deliveryInstructions' in opts
          ? opts.deliveryInstructions
          : 'Post the approved content to the publish channel.';
      return makeOkFetchResponse([{ archetypes: { delivery_instructions: di } }]);
    }

    if ((url as string).includes('select=status')) {
      const idx = Math.min(pollIdx, statuses.length - 1);
      pollIdx++;
      return makeOkFetchResponse([{ status: statuses[idx] }]);
    }

    if (method === 'PATCH' || method === 'POST') {
      return makeOkFetchResponse([]);
    }

    return makeOkFetchResponse([]);
  });
}

function buildFetchMockNoTargetChannel(
  opts: {
    deliveryInstructions?: string | null;
    taskStatuses?: string[];
  } = {},
): ReturnType<typeof vi.fn> {
  let pollIdx = 0;
  const statuses = opts.taskStatuses ?? ['Done'];

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if ((url as string).includes('/deliverables?')) {
      return makeOkFetchResponse([
        {
          metadata: { approval_message_ts: APPROVAL_MSG_TS },
          content: "Today's channel summary content",
          external_ref: TEST_TASK_ID,
        },
      ]);
    }

    if ((url as string).includes('archetypes(delivery_instructions)')) {
      const di =
        'deliveryInstructions' in opts
          ? opts.deliveryInstructions
          : 'Post the approved content to the publish channel.';
      return makeOkFetchResponse([{ archetypes: { delivery_instructions: di } }]);
    }

    if ((url as string).includes('select=status')) {
      const idx = Math.min(pollIdx, statuses.length - 1);
      pollIdx++;
      return makeOkFetchResponse([{ status: statuses[idx] }]);
    }

    if (method === 'PATCH' || method === 'POST') {
      return makeOkFetchResponse([]);
    }

    return makeOkFetchResponse([]);
  });
}

function makeEngine(approvalEvent: unknown) {
  return new InngestTestEngine({
    function: createEmployeeLifecycleFunction(inngest),
    transformCtx: (ctx: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mocked = mockCtx(ctx as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mocked as any).step.waitForEvent = vi.fn().mockResolvedValue(approvalEvent);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mocked as any).step.run = vi
        .fn()
        .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
          switch (id) {
            case 'load-task':
              return makeMockTaskData();
            case 'executing':
              return 'mock-initial-machine-id';
            case 'poll-completion':
              return 'Submitting';
            case 'check-classification':
              return { skipApproval: false };
            case 'handle-approval-result':
              return fn();
            default:
              return undefined;
          }
        });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mocked as any;
    },
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
  mockCreateMachine.mockResolvedValue({ id: 'mock-delivery-machine-id' });
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

  // Make setTimeout resolve immediately so the 15-second delivery polling
  // loop does not block tests
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

describe('employee-lifecycle — delivery flow (handle-approval-result step)', () => {
  it('approve: spawns delivery machine with EMPLOYEE_PHASE=delivery and succeeds on first attempt', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ taskStatuses: ['Done'] }));

    const { error } = await makeEngine(makeApprovalEvent('approve', 'U-ACTOR')).execute(
      triggerEvent(),
    );

    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledOnce();
    expect(mockCreateMachine).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        cmd: ['node', '/app/dist/workers/opencode-harness.mjs'],
        env: expect.objectContaining({
          EMPLOYEE_PHASE: 'delivery',
          TASK_ID: TEST_TASK_ID,
        }),
      }),
    );
    expect(mockDestroyMachine).toHaveBeenCalledOnce();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('delivery failure + retry: first machine fails → second machine succeeds → task Done', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ taskStatuses: ['Failed', 'Done'] }));

    const { error } = await makeEngine(makeApprovalEvent('approve')).execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledTimes(2);
    expect(mockDestroyMachine).toHaveBeenCalledTimes(2);
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('all retries exhausted: 3 machines all fail → task PATCH contains failure_reason', async () => {
    const mockFetch = buildFetchMock({ taskStatuses: ['Failed', 'Failed', 'Failed'] });
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeApprovalEvent('approve')).execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(mockCreateMachine).toHaveBeenCalledTimes(3);
    expect(mockDestroyMachine).toHaveBeenCalledTimes(3);

    const failurePatch = (mockFetch.mock.calls as Array<[string, RequestInit | undefined]>)
      .filter(
        ([, init]) =>
          ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase() === 'PATCH',
      )
      .find(([, init]) => {
        try {
          const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
            failure_reason?: string;
          };
          return body.failure_reason === 'Delivery failed after 3 attempts';
        } catch {
          return false;
        }
      });

    expect(failurePatch).toBeDefined();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('null delivery_instructions → task Failed immediately, no machine spawned', async () => {
    const mockFetch = buildFetchMock({ deliveryInstructions: null });
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeApprovalEvent('approve')).execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(mockCreateMachine).not.toHaveBeenCalled();
    expect(mockDestroyMachine).not.toHaveBeenCalled();

    const failurePatch = (mockFetch.mock.calls as Array<[string, RequestInit | undefined]>)
      .filter(
        ([, init]) =>
          ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase() === 'PATCH',
      )
      .find(([, init]) => {
        try {
          const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
            failure_reason?: string;
          };
          return body.failure_reason === 'Archetype missing delivery_instructions';
        } catch {
          return false;
        }
      });

    expect(failurePatch).toBeDefined();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('reject action → task Cancelled, updateMessage rejection text, no delivery machine', async () => {
    vi.stubGlobal('fetch', buildFetchMock());

    const { error } = await makeEngine(makeApprovalEvent('reject', 'U-REJECTOR')).execute(
      triggerEvent(),
    );

    expect(error).toBeUndefined();
    expect(mockCreateMachine).not.toHaveBeenCalled();
    expect(mockDestroyMachine).not.toHaveBeenCalled();
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      TARGET_CHANNEL,
      APPROVAL_MSG_TS,
      expect.stringContaining('❌ Rejected by <@U-REJECTOR>'),
      expect.any(Array),
    );
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('approvalEvent null (timeout) → task Cancelled, no delivery machine spawned', async () => {
    vi.stubGlobal('fetch', buildFetchMock());

    const { error } = await makeEngine(null).execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(mockCreateMachine).not.toHaveBeenCalled();
    expect(mockDestroyMachine).not.toHaveBeenCalled();
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('approve: updateMessage called with ✅ Approved card mentioning actor', async () => {
    vi.stubGlobal('fetch', buildFetchMock({ taskStatuses: ['Done'] }));

    const { error } = await makeEngine(makeApprovalEvent('approve', 'U-ACTOR')).execute(
      triggerEvent(),
    );

    expect(error).toBeUndefined();
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      TARGET_CHANNEL,
      APPROVAL_MSG_TS,
      expect.stringContaining('✅ Approved by <@U-ACTOR>'),
      expect.arrayContaining([
        expect.objectContaining({ type: 'section' }),
        expect.objectContaining({ type: 'context' }),
      ]),
    );
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('uses NOTIFICATION_CHANNEL when metadata.target_channel is absent', async () => {
    mockLoadTenantEnv.mockResolvedValue({
      SLACK_BOT_TOKEN: 'xoxb-test-bot-token',
      NOTIFICATION_CHANNEL: 'C_NOTIFY_TEST',
    });
    vi.stubGlobal('fetch', buildFetchMockNoTargetChannel());

    const { error } = await makeEngine(makeApprovalEvent('reject', 'U-REJECTOR')).execute(
      triggerEvent(),
    );

    expect(error).toBeUndefined();
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      'C_NOTIFY_TEST',
      APPROVAL_MSG_TS,
      expect.stringContaining('❌ Rejected by <@U-REJECTOR>'),
      expect.any(Array),
    );
  });

  it('NOTIFICATION_CHANNEL takes priority over SUMMARY_TARGET_CHANNEL when metadata.target_channel absent', async () => {
    mockLoadTenantEnv.mockResolvedValue({
      SLACK_BOT_TOKEN: 'xoxb-test-bot-token',
      NOTIFICATION_CHANNEL: 'C_NOTIFY',
      SUMMARY_TARGET_CHANNEL: 'C_LEGACY',
    });
    vi.stubGlobal('fetch', buildFetchMockNoTargetChannel());

    const { error } = await makeEngine(makeApprovalEvent('reject', 'U-REJECTOR')).execute(
      triggerEvent(),
    );

    expect(error).toBeUndefined();
    expect(mockUpdateMessage).toHaveBeenCalledWith(
      'C_NOTIFY',
      APPROVAL_MSG_TS,
      expect.any(String),
      expect.any(Array),
    );
    expect(mockUpdateMessage).not.toHaveBeenCalledWith(
      'C_LEGACY',
      expect.any(String),
      expect.any(String),
      expect.any(Array),
    );
  });
});
