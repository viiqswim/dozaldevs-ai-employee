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

const TEST_TASK_ID = '22222222-2222-2222-2222-222222222222';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';
const APPROVAL_MSG_TS = 'msg-ts-99999.000100';
const TARGET_CHANNEL = 'C-TARGET-GUEST';
const DELIVERABLE_ID = 'del-uuid-1234';

const inngest = new Inngest({ id: 'ai-employee-test-guest-approval' });

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

function buildFetchMockWithDeliverable(opts: {
  deliveryInstructions?: string | null;
  taskStatuses?: string[];
  deliverableContent?: string;
  taskMetadata?: Record<string, unknown>;
}): ReturnType<typeof vi.fn> {
  let pollIdx = 0;
  const statuses = opts.taskStatuses ?? ['Done'];
  const deliverableContent =
    opts.deliverableContent ?? JSON.stringify({ draftResponse: 'Original draft.' });

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if ((url as string).includes('/deliverables?')) {
      return makeOkFetchResponse([
        {
          id: DELIVERABLE_ID,
          metadata: { approval_message_ts: APPROVAL_MSG_TS, target_channel: TARGET_CHANNEL },
          content: deliverableContent,
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

    if ((url as string).includes('select=metadata')) {
      return makeOkFetchResponse([{ metadata: opts.taskMetadata ?? {} }]);
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
      const mocked = mockCtx(ctx as any);
      (mocked as any).step.waitForEvent = vi.fn().mockResolvedValue(approvalEvent);
      (mocked as any).step.sendEvent = vi.fn().mockResolvedValue(undefined);
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

describe('employee-lifecycle — editedContent path', () => {
  it('approve with editedContent: PATCHes deliverable content with draftResponse field', async () => {
    const mockFetch = buildFetchMockWithDeliverable({
      taskStatuses: ['Done'],
      deliverableContent: JSON.stringify({ draftResponse: 'Original draft.' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const approvalEvent = {
      name: 'employee/approval.received',
      data: {
        taskId: TEST_TASK_ID,
        action: 'approve',
        userId: 'U-EDITOR',
        editedContent: 'Edited response text.',
      },
    };

    const { error } = await makeEngine(approvalEvent).execute(triggerEvent());
    expect(error).toBeUndefined();

    const patchCalls = (mockFetch.mock.calls as Array<[string, RequestInit | undefined]>).filter(
      ([url, init]) =>
        (url as string).includes('/deliverables?') &&
        ((init as RequestInit | undefined)?.method ?? '').toUpperCase() === 'PATCH',
    );

    expect(patchCalls.length).toBeGreaterThan(0);

    const deliverablePatch = patchCalls.find(([, init]) => {
      try {
        const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
          content?: string;
        };
        if (!body.content) return false;
        const parsed = JSON.parse(body.content) as { draftResponse?: string };
        return parsed.draftResponse === 'Edited response text.';
      } catch {
        return false;
      }
    });

    expect(deliverablePatch).toBeDefined();
  });

  it('approve without editedContent: does NOT PATCH deliverable content', async () => {
    const mockFetch = buildFetchMockWithDeliverable({ taskStatuses: ['Done'] });
    vi.stubGlobal('fetch', mockFetch);

    const approvalEvent = {
      name: 'employee/approval.received',
      data: { taskId: TEST_TASK_ID, action: 'approve', userId: 'U-APPROVER' },
    };

    const { error } = await makeEngine(approvalEvent).execute(triggerEvent());
    expect(error).toBeUndefined();

    const deliverableContentPatch = (
      mockFetch.mock.calls as Array<[string, RequestInit | undefined]>
    ).find(([url, init]) => {
      if (!(url as string).includes('/deliverables?')) return false;
      if (((init as RequestInit | undefined)?.method ?? '').toUpperCase() !== 'PATCH') return false;
      try {
        const body = JSON.parse(
          ((init as RequestInit | undefined)?.body as string) ?? '{}',
        ) as Record<string, unknown>;
        return 'content' in body;
      } catch {
        return false;
      }
    });

    expect(deliverableContentPatch).toBeUndefined();
  });
});

describe('employee-lifecycle — rejectionReason path', () => {
  it('reject with rejectionReason: PATCHes task metadata with rejectionReason', async () => {
    const mockFetch = buildFetchMockWithDeliverable({
      taskStatuses: ['Done'],
      taskMetadata: { someExistingKey: 'value' },
    });
    vi.stubGlobal('fetch', mockFetch);

    const approvalEvent = {
      name: 'employee/approval.received',
      data: {
        taskId: TEST_TASK_ID,
        action: 'reject',
        userId: 'U-REJECTER',
        rejectionReason: 'Response was inaccurate.',
      },
    };

    const { error } = await makeEngine(approvalEvent).execute(triggerEvent());
    expect(error).toBeUndefined();

    const metaPatchCalls = (
      mockFetch.mock.calls as Array<[string, RequestInit | undefined]>
    ).filter(
      ([url, init]) =>
        (url as string).includes(`/rest/v1/tasks?id=eq.${TEST_TASK_ID}`) &&
        ((init as RequestInit | undefined)?.method ?? '').toUpperCase() === 'PATCH',
    );

    const rejectionPatch = metaPatchCalls.find(([, init]) => {
      try {
        const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
          metadata?: { rejectionReason?: string };
        };
        return body.metadata?.rejectionReason === 'Response was inaccurate.';
      } catch {
        return false;
      }
    });

    expect(rejectionPatch).toBeDefined();
  });

  it('reject without rejectionReason: does NOT PATCH task metadata with rejectionReason', async () => {
    const mockFetch = buildFetchMockWithDeliverable({ taskStatuses: ['Done'] });
    vi.stubGlobal('fetch', mockFetch);

    const approvalEvent = {
      name: 'employee/approval.received',
      data: { taskId: TEST_TASK_ID, action: 'reject', userId: 'U-REJECTER-NOREASON' },
    };

    const { error } = await makeEngine(approvalEvent).execute(triggerEvent());
    expect(error).toBeUndefined();

    const rejectionMetaPatch = (
      mockFetch.mock.calls as Array<[string, RequestInit | undefined]>
    ).find(([url, init]) => {
      if (!(url as string).includes(`/rest/v1/tasks?id=eq.${TEST_TASK_ID}`)) return false;
      if (((init as RequestInit | undefined)?.method ?? '').toUpperCase() !== 'PATCH') return false;
      try {
        const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
          metadata?: { rejectionReason?: string };
        };
        return body.metadata?.rejectionReason !== undefined;
      } catch {
        return false;
      }
    });

    expect(rejectionMetaPatch).toBeUndefined();
  });
});
