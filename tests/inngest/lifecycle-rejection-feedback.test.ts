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
const TARGET_CHANNEL = 'C-TARGET-REJECTION';
const DELIVERABLE_ID = 'del-uuid-rejection-1234';

const inngest = new Inngest({ id: 'ai-employee-test-rejection-feedback' });

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

function buildFetchMock(
  opts: { includeApprovalMsgTs?: boolean; taskMetadata?: Record<string, unknown> } = {},
): ReturnType<typeof vi.fn> {
  const { includeApprovalMsgTs = true, taskMetadata = {} } = opts;
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if ((url as string).includes('/deliverables?')) {
      return makeOkFetchResponse([
        {
          id: DELIVERABLE_ID,
          metadata: includeApprovalMsgTs
            ? { approval_message_ts: APPROVAL_MSG_TS, target_channel: TARGET_CHANNEL }
            : { target_channel: TARGET_CHANNEL },
          content: JSON.stringify({ draftResponse: 'Test draft.' }),
          external_ref: TEST_TASK_ID,
        },
      ]);
    }

    if ((url as string).includes('archetypes(delivery_instructions)')) {
      return makeOkFetchResponse([{ archetypes: { delivery_instructions: 'Post content.' } }]);
    }

    if ((url as string).includes('select=status')) {
      return makeOkFetchResponse([{ status: 'Done' }]);
    }

    if ((url as string).includes('select=metadata')) {
      return makeOkFetchResponse([{ metadata: taskMetadata }]);
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

function makeRejectionEvent(overrides: Record<string, unknown> = {}) {
  return {
    name: 'employee/approval.received',
    data: { taskId: TEST_TASK_ID, action: 'reject', userId: 'U-REJECTER', ...overrides },
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

describe('employee-lifecycle — rejection feedback loop', () => {
  it('1. posts thread reply with correct channel, thread_ts, and canonical message text', async () => {
    const mockFetch = buildFetchMock({ includeApprovalMsgTs: true });
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeRejectionEvent()).execute(triggerEvent());
    expect(error).toBeUndefined();

    const threadReplyCalls = mockPostMessage.mock.calls.filter((callArgs) => {
      const params = callArgs[0] as { thread_ts?: string };
      return !!params?.thread_ts;
    });
    expect(threadReplyCalls.length).toBeGreaterThan(0);

    const callParams = threadReplyCalls[0][0] as {
      channel: string;
      thread_ts: string;
      text: string;
    };
    expect(callParams.channel).toBe(TARGET_CHANNEL);
    expect(callParams.thread_ts).toBe(APPROVAL_MSG_TS);
    expect(callParams.text).toContain('Got it, <@U-REJECTER>');
    expect(callParams.text).toContain('What should I have done differently?');
  });

  it('2. skips thread reply when approvalMsgTs is absent — task still reaches Cancelled', async () => {
    const mockFetch = buildFetchMock({ includeApprovalMsgTs: false });
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeRejectionEvent()).execute(triggerEvent());
    expect(error).toBeUndefined();

    const threadReplyCalls = mockPostMessage.mock.calls.filter((callArgs) => {
      const params = callArgs[0] as { thread_ts?: string };
      return !!params?.thread_ts;
    });
    expect(threadReplyCalls.length).toBe(0);

    const cancelPatches = (mockFetch.mock.calls as Array<[string, RequestInit | undefined]>).filter(
      ([url, init]) => {
        if (!(url as string).includes(`/rest/v1/tasks?id=eq.${TEST_TASK_ID}`)) return false;
        if (((init as RequestInit | undefined)?.method ?? '').toUpperCase() !== 'PATCH')
          return false;
        try {
          const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
            status?: string;
          };
          return body.status === 'Cancelled';
        } catch {
          return false;
        }
      },
    );
    expect(cancelPatches.length).toBeGreaterThan(0);
  });

  it('3. stores rejectionReason in feedback table when rejectionReason present', async () => {
    const mockFetch = buildFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(
      makeRejectionEvent({ rejectionReason: 'Too casual tone' }),
    ).execute(triggerEvent());
    expect(error).toBeUndefined();

    const feedbackPostCalls = (
      mockFetch.mock.calls as Array<[string, RequestInit | undefined]>
    ).filter(
      ([url, init]) =>
        (url as string).includes('/rest/v1/feedback') &&
        ((init as RequestInit | undefined)?.method ?? '').toUpperCase() === 'POST',
    );

    const rejectionFeedbackPost = feedbackPostCalls.find(([, init]) => {
      try {
        const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
          feedback_type?: string;
        };
        return body.feedback_type === 'rejection_reason';
      } catch {
        return false;
      }
    });

    expect(rejectionFeedbackPost).toBeDefined();

    const [, postInit] = rejectionFeedbackPost!;
    const postBody = JSON.parse(
      ((postInit as RequestInit | undefined)?.body as string) ?? '{}',
    ) as { correction_reason?: string };
    expect(postBody.correction_reason).toBe('Too casual tone');
  });

  it('4. does NOT post to feedback table when rejectionReason is absent', async () => {
    const mockFetch = buildFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeRejectionEvent()).execute(triggerEvent());
    expect(error).toBeUndefined();

    const rejectionFeedbackPost = (
      mockFetch.mock.calls as Array<[string, RequestInit | undefined]>
    ).find(([url, init]) => {
      if (!(url as string).includes('/rest/v1/feedback')) return false;
      if (((init as RequestInit | undefined)?.method ?? '').toUpperCase() !== 'POST') return false;
      try {
        const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
          feedback_type?: string;
        };
        return body.feedback_type === 'rejection_reason';
      } catch {
        return false;
      }
    });

    expect(rejectionFeedbackPost).toBeUndefined();
  });

  it('5. thread reply failure is non-fatal — task still patched to Cancelled', async () => {
    mockPostMessage.mockRejectedValueOnce(new Error('Slack API error'));
    const mockFetch = buildFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeRejectionEvent()).execute(triggerEvent());
    expect(error).toBeUndefined();

    const cancelPatches = (mockFetch.mock.calls as Array<[string, RequestInit | undefined]>).filter(
      ([url, init]) => {
        if (!(url as string).includes(`/rest/v1/tasks?id=eq.${TEST_TASK_ID}`)) return false;
        if (((init as RequestInit | undefined)?.method ?? '').toUpperCase() !== 'PATCH')
          return false;
        try {
          const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
            status?: string;
          };
          return body.status === 'Cancelled';
        } catch {
          return false;
        }
      },
    );
    expect(cancelPatches.length).toBeGreaterThan(0);
  });

  it('6. task metadata includes rejection_feedback_requested=true and rejection_user_id', async () => {
    const mockFetch = buildFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeRejectionEvent()).execute(triggerEvent());
    expect(error).toBeUndefined();

    const metaFlagPatches = (
      mockFetch.mock.calls as Array<[string, RequestInit | undefined]>
    ).filter(
      ([url, init]) =>
        (url as string).includes(`/rest/v1/tasks?id=eq.${TEST_TASK_ID}`) &&
        ((init as RequestInit | undefined)?.method ?? '').toUpperCase() === 'PATCH',
    );

    const flagPatch = metaFlagPatches.find(([, init]) => {
      try {
        const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
          metadata?: Record<string, unknown>;
        };
        return body.metadata?.rejection_feedback_requested === true;
      } catch {
        return false;
      }
    });

    expect(flagPatch).toBeDefined();

    const flagBody = JSON.parse(
      ((flagPatch![1] as RequestInit | undefined)?.body as string) ?? '{}',
    ) as { metadata?: Record<string, unknown> };
    expect(flagBody.metadata?.rejection_user_id).toBe('U-REJECTER');
  });

  it('7. metadata merge preserves existing metadata keys', async () => {
    const mockFetch = buildFetchMock({ taskMetadata: { someExistingKey: 'value' } });
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeRejectionEvent()).execute(triggerEvent());
    expect(error).toBeUndefined();

    const metaFlagPatches = (
      mockFetch.mock.calls as Array<[string, RequestInit | undefined]>
    ).filter(
      ([url, init]) =>
        (url as string).includes(`/rest/v1/tasks?id=eq.${TEST_TASK_ID}`) &&
        ((init as RequestInit | undefined)?.method ?? '').toUpperCase() === 'PATCH',
    );

    const flagPatch = metaFlagPatches.find(([, init]) => {
      try {
        const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
          metadata?: Record<string, unknown>;
        };
        return body.metadata?.rejection_feedback_requested === true;
      } catch {
        return false;
      }
    });

    expect(flagPatch).toBeDefined();

    const flagBody = JSON.parse(
      ((flagPatch![1] as RequestInit | undefined)?.body as string) ?? '{}',
    ) as { metadata?: Record<string, unknown> };
    expect(flagBody.metadata?.someExistingKey).toBe('value');
  });

  it('8. approval message updated to ❌ Rejected', async () => {
    const mockFetch = buildFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeRejectionEvent()).execute(triggerEvent());
    expect(error).toBeUndefined();

    expect(mockUpdateMessage).toHaveBeenCalled();
    const updateCall = mockUpdateMessage.mock.calls.find((callArgs) => {
      const text = callArgs[2] as string;
      return text?.includes('❌ Rejected by <@U-REJECTER>.');
    });
    expect(updateCall).toBeDefined();
  });

  it('9. task patched to Cancelled status', async () => {
    const mockFetch = buildFetchMock();
    vi.stubGlobal('fetch', mockFetch);

    const { error } = await makeEngine(makeRejectionEvent()).execute(triggerEvent());
    expect(error).toBeUndefined();

    const cancelPatches = (mockFetch.mock.calls as Array<[string, RequestInit | undefined]>).filter(
      ([url, init]) => {
        if (!(url as string).includes(`/rest/v1/tasks?id=eq.${TEST_TASK_ID}`)) return false;
        if (((init as RequestInit | undefined)?.method ?? '').toUpperCase() !== 'PATCH')
          return false;
        try {
          const body = JSON.parse(((init as RequestInit | undefined)?.body as string) ?? '{}') as {
            status?: string;
          };
          return body.status === 'Cancelled';
        } catch {
          return false;
        }
      },
    );
    expect(cancelPatches.length).toBeGreaterThan(0);
  });
});
