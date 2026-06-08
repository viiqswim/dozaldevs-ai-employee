import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';

const {
  mockHandleApprove,
  mockHandleSupersede,
  mockHandleExpiry,
  mockHandleReject,
  mockLoadTenantSlack,
  mockPatchTask,
  mockLogStatusTransition,
  mockRecordWorkMetric,
  mockStopLocalDockerContainer,
  mockGetPendingApproval,
  mockTrackPendingApproval,
  mockClearPendingApproval,
  mockDestroyMachine,
} = vi.hoisted(() => ({
  mockHandleApprove: vi.fn().mockResolvedValue(undefined),
  mockHandleSupersede: vi.fn().mockResolvedValue(undefined),
  mockHandleExpiry: vi.fn().mockResolvedValue(undefined),
  mockHandleReject: vi.fn().mockResolvedValue(undefined),
  mockLoadTenantSlack: vi.fn(),
  mockPatchTask: vi.fn().mockResolvedValue(undefined),
  mockLogStatusTransition: vi.fn().mockResolvedValue(undefined),
  mockRecordWorkMetric: vi.fn().mockResolvedValue(undefined),
  mockStopLocalDockerContainer: vi.fn(),
  mockGetPendingApproval: vi.fn().mockResolvedValue(null),
  mockTrackPendingApproval: vi.fn().mockResolvedValue(undefined),
  mockClearPendingApproval: vi.fn().mockResolvedValue(undefined),
  mockDestroyMachine: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../../src/inngest/lifecycle/steps/approval-handler.js', () => ({
  handleApprove: mockHandleApprove,
  handleSupersede: mockHandleSupersede,
  handleExpiry: mockHandleExpiry,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/approval-handler-reject.js', () => ({
  handleReject: mockHandleReject,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/notify-and-track.js', () => ({
  loadTenantSlack: mockLoadTenantSlack,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/delivery-retry.js', () => ({
  runDeliveryWithRetry: vi.fn().mockResolvedValue({ status: 'done' }),
}));

vi.mock('../../../../src/inngest/lib/lifecycle-helpers.js', () => ({
  patchTask: mockPatchTask,
  logStatusTransition: mockLogStatusTransition,
  recordWorkMetric: mockRecordWorkMetric,
  stopLocalDockerContainer: mockStopLocalDockerContainer,
}));

vi.mock('../../../../src/inngest/lib/pending-approvals.js', () => ({
  getPendingApproval: mockGetPendingApproval,
  trackPendingApproval: mockTrackPendingApproval,
  clearPendingApproval: mockClearPendingApproval,
}));

vi.mock('../../../../src/lib/fly-client.js', () => ({
  destroyMachine: mockDestroyMachine,
}));

vi.mock('../../../../src/lib/config.js', () => ({
  WORKER_RUNTIME: 'docker',
}));

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    chat: {
      delete: vi.fn().mockResolvedValue({ ok: true }),
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'mock-ts' }),
    },
  })),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
  Prisma: { JsonNull: 'JsonNull' },
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { runReviewingPath } from '../../../../src/inngest/lifecycle/steps/reviewing-path.js';
import type { ReviewingPathContext } from '../../../../src/inngest/lifecycle/steps/reviewing-path.js';

const TASK_ID = 'aaaa0001-0000-0000-0000-000000000000';
const ARCHETYPE_ID = 'arch0001-0000-0000-0000-000000000000';
const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-key';
const MACHINE_ID = 'docker_test-machine';

const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

function makeOkFetchResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
}

function buildDefaultFetch(
  opts: {
    taskStatus?: string;
    deliverableMetadata?: Record<string, unknown>;
  } = {},
): ReturnType<typeof vi.fn> {
  const { taskStatus = 'Done', deliverableMetadata = {} } = opts;
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
    if (method === 'PATCH' || method === 'POST') {
      return makeOkFetchResponse([]);
    }
    if ((url as string).includes('/deliverables?')) {
      return makeOkFetchResponse([
        {
          id: 'deliv-1',
          metadata: {
            approval_message_ts: 'ts-approval-001',
            target_channel: 'C-APPROVAL',
            ...deliverableMetadata,
          },
          content: JSON.stringify({ draftResponse: 'Hello guest' }),
          external_ref: TASK_ID,
        },
      ]);
    }
    if ((url as string).includes('select=status')) {
      return makeOkFetchResponse([{ status: taskStatus }]);
    }
    if ((url as string).includes('select=raw_event')) {
      return makeOkFetchResponse([{ raw_event: {} }]);
    }
    return makeOkFetchResponse([]);
  });
}

function makeCtx(overrides: Partial<ReviewingPathContext> = {}): ReviewingPathContext {
  const inngest = new Inngest({ id: 'test-reviewing-path' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- inngest.send is overloaded and requires this cast in test context
  vi.spyOn(inngest, 'send').mockResolvedValue(undefined as any);
  return {
    taskId: TASK_ID,
    archetypeId: ARCHETYPE_ID,
    tenantId: TENANT_ID,
    runId: 'run-test-001',
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    headers: HEADERS,
    taskData: {},
    archetype: { role_name: 'Test Employee' },
    machineId: MACHINE_ID,
    timeoutHours: 24,
    notifyMsgRef: { ts: 'ts-notify-001', channel: 'C-NOTIFY' },
    notifyBlocks: vi.fn().mockReturnValue([]),
    notifyStateBlocks: vi.fn().mockReturnValue([]),
    inngest,
    ...overrides,
  };
}

function makeStep(
  overrides: {
    waitForEvent?: ReturnType<typeof vi.fn>;
    skipSteps?: string[];
  } = {},
) {
  const skipSteps = overrides.skipSteps ?? [];
  return {
    run: vi.fn().mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
      if (skipSteps.includes(id)) return undefined;
      return fn();
    }),
    waitForEvent: overrides.waitForEvent ?? vi.fn().mockResolvedValue(null),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadTenantSlack.mockResolvedValue({
    botToken: 'xoxb-test',
    channel: 'C-NOTIFY',
    tenantEnv: { SLACK_BOT_TOKEN: 'xoxb-test', NOTIFICATION_CHANNEL: 'C-NOTIFY' },
    slackClient: {
      updateMessage: vi.fn().mockResolvedValue({}),
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts-nudge-001' }),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runReviewingPath — handle-approval-result routing', () => {
  it('approve action → calls handleApprove', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch({ taskStatus: 'Done' }));

    const approvalEvent = {
      name: 'employee/approval.received',
      data: { taskId: TASK_ID, action: 'approve', userId: 'U-APPROVER' },
    };
    const step = makeStep({ waitForEvent: vi.fn().mockResolvedValue(approvalEvent) });

    await runReviewingPath(makeCtx(), step as never);

    expect(mockHandleApprove).toHaveBeenCalledOnce();
    expect(mockHandleSupersede).not.toHaveBeenCalled();
    expect(mockHandleReject).not.toHaveBeenCalled();
    expect(mockHandleExpiry).not.toHaveBeenCalled();
  });

  it('superseded action → calls handleSupersede', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch({ taskStatus: 'Cancelled' }));

    const approvalEvent = {
      name: 'employee/approval.received',
      data: { taskId: TASK_ID, action: 'superseded', userId: 'system' },
    };
    const step = makeStep({ waitForEvent: vi.fn().mockResolvedValue(approvalEvent) });

    await runReviewingPath(makeCtx(), step as never);

    expect(mockHandleSupersede).toHaveBeenCalledOnce();
    expect(mockHandleApprove).not.toHaveBeenCalled();
    expect(mockHandleReject).not.toHaveBeenCalled();
    expect(mockHandleExpiry).not.toHaveBeenCalled();
  });

  it('reject action → calls handleReject', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch({ taskStatus: 'Cancelled' }));

    const approvalEvent = {
      name: 'employee/approval.received',
      data: {
        taskId: TASK_ID,
        action: 'reject',
        userId: 'U-REJECTER',
        rejectionReason: 'Not relevant',
      },
    };
    const step = makeStep({ waitForEvent: vi.fn().mockResolvedValue(approvalEvent) });

    await runReviewingPath(makeCtx(), step as never);

    expect(mockHandleReject).toHaveBeenCalledOnce();
    expect(mockHandleApprove).not.toHaveBeenCalled();
    expect(mockHandleSupersede).not.toHaveBeenCalled();
    expect(mockHandleExpiry).not.toHaveBeenCalled();
  });

  it('null approval event (timeout/expiry) → calls handleExpiry', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch({ taskStatus: 'Cancelled' }));

    const step = makeStep({ waitForEvent: vi.fn().mockResolvedValue(null) });

    await runReviewingPath(makeCtx(), step as never);

    expect(mockHandleExpiry).toHaveBeenCalledOnce();
    expect(mockHandleApprove).not.toHaveBeenCalled();
    expect(mockHandleSupersede).not.toHaveBeenCalled();
    expect(mockHandleReject).not.toHaveBeenCalled();
  });

  it('waitForEvent is called with correct event name and match field', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch());

    const step = makeStep();
    const ctx = makeCtx();

    await runReviewingPath(ctx, step as never);

    expect(step.waitForEvent).toHaveBeenCalledWith(
      'wait-for-approval',
      expect.objectContaining({
        event: 'employee/approval.received',
        match: 'data.taskId',
        timeout: '24h',
      }),
    );
  });
});

describe('runReviewingPath — set-reviewing step', () => {
  it('patches task to Reviewing status', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch());
    const step = makeStep();

    await runReviewingPath(makeCtx(), step as never);

    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Reviewing' }),
    );
    expect(mockLogStatusTransition).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      'Reviewing',
      'Submitting',
    );
  });
});

describe('runReviewingPath — record-work-metric-approval step', () => {
  it('records work metric when task status is Done', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch({ taskStatus: 'Done' }));
    const step = makeStep();

    await runReviewingPath(makeCtx(), step as never);

    expect(mockRecordWorkMetric).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      ARCHETYPE_ID,
      TENANT_ID,
    );
  });

  it('does NOT record work metric when task status is Cancelled', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch({ taskStatus: 'Cancelled' }));
    const step = makeStep();

    await runReviewingPath(makeCtx(), step as never);

    expect(mockRecordWorkMetric).not.toHaveBeenCalled();
  });
});

describe('runReviewingPath — cleanup step', () => {
  it('calls stopLocalDockerContainer for docker_ machine IDs', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch());
    const step = makeStep();

    await runReviewingPath(makeCtx({ machineId: 'docker_abc' }), step as never);

    expect(mockStopLocalDockerContainer).toHaveBeenCalledWith(`employee-${TASK_ID.slice(0, 8)}`);
    expect(mockDestroyMachine).not.toHaveBeenCalled();
  });
});

describe('runReviewingPath — check-supersede step', () => {
  it('returns early (no supersede event) when no thread_uid and no conversation_ref', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH' || method === 'POST') return makeOkFetchResponse([]);
      if ((url as string).includes('/deliverables?'))
        return makeOkFetchResponse([{ metadata: {} }]);
      if ((url as string).includes('select=status'))
        return makeOkFetchResponse([{ status: 'Done' }]);
      if ((url as string).includes('select=raw_event'))
        return makeOkFetchResponse([{ raw_event: {} }]);
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeCtx({ taskData: {} });
    const step = makeStep();

    await runReviewingPath(ctx, step as never);

    expect(ctx.inngest.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'employee/approval.received' }),
    );
  });

  it('skips supersede when existing pending approval already belongs to this task', async () => {
    mockGetPendingApproval.mockResolvedValue({
      taskId: TASK_ID,
      slackTs: 'ts-existing',
      channelId: 'C-EXISTING',
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH' || method === 'POST') return makeOkFetchResponse([]);
      if ((url as string).includes('/deliverables?'))
        return makeOkFetchResponse([{ metadata: { conversation_ref: 'thread-abc' } }]);
      if ((url as string).includes('select=status'))
        return makeOkFetchResponse([{ status: 'Done' }]);
      if ((url as string).includes('select=raw_event'))
        return makeOkFetchResponse([{ raw_event: {} }]);
      if ((url as string).includes('select=id,status')) return makeOkFetchResponse([]);
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeCtx();
    const step = makeStep();

    await runReviewingPath(ctx, step as never);

    expect(ctx.inngest.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'employee/approval.received' }),
    );
  });

  it('sends supersede event when a different task has a Reviewing pending approval for the same conversation', async () => {
    const OLD_TASK_ID = 'bbbb0002-0000-0000-0000-000000000000';
    mockGetPendingApproval.mockResolvedValue({
      taskId: OLD_TASK_ID,
      slackTs: 'ts-old-approval',
      channelId: 'C-EXISTING',
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH' || method === 'POST') return makeOkFetchResponse([]);
      if ((url as string).includes('/deliverables?'))
        return makeOkFetchResponse([{ metadata: { conversation_ref: 'thread-abc' } }]);
      if (
        (url as string).includes(`tasks?id=eq.${OLD_TASK_ID}`) &&
        (url as string).includes('select=status')
      )
        return makeOkFetchResponse([{ status: 'Reviewing' }]);
      if ((url as string).includes('select=status'))
        return makeOkFetchResponse([{ status: 'Done' }]);
      if ((url as string).includes('select=raw_event'))
        return makeOkFetchResponse([{ raw_event: {} }]);
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeCtx({ taskData: {} });
    const step = makeStep();

    await runReviewingPath(ctx, step as never);

    expect(ctx.inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/approval.received',
        data: expect.objectContaining({
          taskId: OLD_TASK_ID,
          action: 'superseded',
        }),
      }),
    );
  });

  it('clears stale pending approval when old task is no longer in Reviewing or Cancelled', async () => {
    const OLD_TASK_ID = 'cccc0003-0000-0000-0000-000000000000';
    mockGetPendingApproval.mockResolvedValue({
      taskId: OLD_TASK_ID,
      slackTs: 'ts-stale',
      channelId: 'C-STALE',
    });

    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH' || method === 'POST') return makeOkFetchResponse([]);
      if ((url as string).includes('/deliverables?'))
        return makeOkFetchResponse([{ metadata: { conversation_ref: 'thread-xyz' } }]);
      if (
        (url as string).includes(`tasks?id=eq.${OLD_TASK_ID}`) &&
        (url as string).includes('select=status')
      )
        return makeOkFetchResponse([{ status: 'Done' }]);
      if ((url as string).includes('select=status'))
        return makeOkFetchResponse([{ status: 'Done' }]);
      if ((url as string).includes('select=raw_event'))
        return makeOkFetchResponse([{ raw_event: {} }]);
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const ctx = makeCtx();
    const step = makeStep();

    await runReviewingPath(ctx, step as never);

    expect(mockClearPendingApproval).toHaveBeenCalled();
    expect(ctx.inngest.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'employee/approval.received' }),
    );
  });
});

describe('runReviewingPath — track-pending-approval step', () => {
  it('tracks pending approval when approval_message_ts and target_channel are present', async () => {
    vi.stubGlobal(
      'fetch',
      buildDefaultFetch({
        taskStatus: 'Done',
        deliverableMetadata: {
          approval_message_ts: 'ts-approval-001',
          target_channel: 'C-APPROVAL',
        },
      }),
    );
    const step = makeStep();

    await runReviewingPath(makeCtx(), step as never);

    expect(mockTrackPendingApproval).toHaveBeenCalledWith(
      SUPABASE_URL,
      SUPABASE_KEY,
      expect.objectContaining({
        taskId: TASK_ID,
        slackTs: 'ts-approval-001',
        channelId: 'C-APPROVAL',
      }),
    );
  });

  it('does NOT track pending approval when approval_message_ts is missing', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
      if (method === 'PATCH' || method === 'POST') return makeOkFetchResponse([]);
      if ((url as string).includes('/deliverables?'))
        return makeOkFetchResponse([{ metadata: { target_channel: 'C-APPROVAL' }, content: '{}' }]);
      if ((url as string).includes('select=status'))
        return makeOkFetchResponse([{ status: 'Done' }]);
      if ((url as string).includes('select=raw_event'))
        return makeOkFetchResponse([{ raw_event: {} }]);
      return makeOkFetchResponse([]);
    });
    vi.stubGlobal('fetch', fetchMock);

    const step = makeStep();
    await runReviewingPath(makeCtx(), step as never);

    expect(mockTrackPendingApproval).not.toHaveBeenCalled();
  });
});

describe('runReviewingPath — update-notify-reviewing step', () => {
  it('step is invoked even when notifyMsgRef is null (no Slack update attempted)', async () => {
    vi.stubGlobal('fetch', buildDefaultFetch());
    const step = makeStep();
    const ctx = makeCtx({ notifyMsgRef: null });

    await runReviewingPath(ctx, step as never);

    expect(
      (step.run as ReturnType<typeof vi.fn>).mock.calls.some(
        ([id]: [string]) => id === 'update-notify-reviewing',
      ),
    ).toBe(true);
  });
});
