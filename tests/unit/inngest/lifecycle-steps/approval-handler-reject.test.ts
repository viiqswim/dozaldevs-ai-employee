import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';

const mockPatchTask = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockLogStatusTransition = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockClearPendingApprovalByTaskId = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockMergeFn = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockWriteFeedbackEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBuildTerminalBlocksWithContext = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockBuildContextThreadBlocks = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockBuildHostfullyLink = vi.hoisted(() =>
  vi.fn().mockReturnValue('https://app.hostfully.com/thread/123'),
);

vi.mock('../../../../src/inngest/lib/lifecycle-helpers.js', () => ({
  patchTask: mockPatchTask,
  logStatusTransition: mockLogStatusTransition,
}));

vi.mock('../../../../src/inngest/lib/pending-approvals.js', () => ({
  clearPendingApprovalByTaskId: mockClearPendingApprovalByTaskId,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/lifecycle-helpers.js', () => ({
  mergeTaskMetadata: mockMergeFn,
  writeFeedbackEvent: mockWriteFeedbackEvent,
}));

vi.mock('../../../../src/lib/slack-blocks.js', () => ({
  buildTerminalBlocksWithContext: mockBuildTerminalBlocksWithContext,
  buildContextThreadBlocks: mockBuildContextThreadBlocks,
}));

vi.mock('../../../../src/lib/enrichment-adapters/hostfully.js', () => ({
  buildHostfullyLink: mockBuildHostfullyLink,
}));

vi.mock('../../../../src/inngest/lib/postgrest-headers.js', () => ({
  makePostgrestHeaders: vi.fn().mockReturnValue({
    apikey: 'test-key',
    Authorization: 'Bearer test-key',
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  }),
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { handleReject } from '../../../../src/inngest/lifecycle/steps/approval-handler-reject.js';
import type { ApprovalHandlerContext } from '../../../../src/inngest/lifecycle/steps/approval-handler.js';

const TASK_ID = 'eeee0001-0000-0000-0000-000000000000';
const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const ARCHETYPE_ID = 'arch0001-0000-0000-0000-000000000000';
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-key';
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

const mockUpdateMessage = vi.fn().mockResolvedValue({});
const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts-reply-001' });

const mockSlackClient = {
  updateMessage: mockUpdateMessage,
  postMessage: mockPostMessage,
} as unknown as ReturnType<typeof import('../../../../src/lib/slack-client.js').createSlackClient>;

function makeCtx(overrides: Partial<ApprovalHandlerContext> = {}): ApprovalHandlerContext {
  const inngest = new Inngest({ id: 'test-reject-handler' });
  vi.spyOn(inngest, 'send').mockResolvedValue(undefined as never);
  return {
    taskId: TASK_ID,
    tenantId: TENANT_ID,
    archetypeId: ARCHETYPE_ID,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    headers: HEADERS,
    archetype: { role_name: 'Test Employee' },
    notifyMsgRef: { ts: 'ts-notify-001', channel: 'C-NOTIFY' },
    notifyBlocks: vi.fn().mockReturnValue([]),
    notifyStateBlocks: vi.fn().mockReturnValue([]),
    inngest,
    runDelivery: vi.fn().mockResolvedValue({ status: 'done' }),
    ...overrides,
  };
}

function makeDeliverable(metadataOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'deliv-001',
    metadata: {
      approval_message_ts: 'ts-approval-001',
      target_channel: 'C-APPROVAL',
      ...metadataOverrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleReject — terminal state transitions', () => {
  it('patches task to Cancelled and logs the transition', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', undefined);

    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Cancelled' }),
    );
    expect(mockLogStatusTransition).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      'Cancelled',
      'Reviewing',
    );
  });

  it('clears pending approval before setting Cancelled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const callOrder: string[] = [];
    mockClearPendingApprovalByTaskId.mockImplementationOnce(() => {
      callOrder.push('clear');
      return Promise.resolve();
    });
    mockPatchTask.mockImplementationOnce(() => {
      callOrder.push('patch');
      return Promise.resolve();
    });

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', undefined);

    expect(callOrder).toEqual(['clear', 'patch']);
  });
});

describe('handleReject — rejection reason handling', () => {
  it('stores rejectionReason in task metadata when provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', 'Wrong tone');

    expect(mockMergeFn).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ rejectionReason: 'Wrong tone' }),
    );
  });

  it('does NOT call mergeTaskMetadata with rejectionReason when undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', undefined);

    const rejectionReasonCalls = mockMergeFn.mock.calls.filter(
      ([, , , updates]: [string, Record<string, string>, string, Record<string, unknown>]) =>
        'rejectionReason' in (updates as Record<string, unknown>),
    );
    expect(rejectionReasonCalls).toHaveLength(0);
  });

  it('fires writeFeedbackEvent with rejection_reason type when rejectionReason provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', 'Too formal');

    expect(mockWriteFeedbackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'rejection_reason',
        actorId: 'U-REJECTER',
        correctionContent: 'Too formal',
        taskId: TASK_ID,
      }),
    );
  });

  it('fires inngest rule.extract-requested event when rejectionReason provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const ctx = makeCtx();

    await handleReject(ctx, makeDeliverable(), mockSlackClient, 'U-REJECTER', 'Wrong tone');

    expect(ctx.inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/rule.extract-requested',
        data: expect.objectContaining({
          feedbackType: 'rejection_reason',
          content: 'Wrong tone',
          actorUserId: 'U-REJECTER',
        }),
      }),
    );
  });

  it('does NOT fire rule.extract-requested when rejectionReason is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
    const ctx = makeCtx();

    await handleReject(ctx, makeDeliverable(), mockSlackClient, 'U-REJECTER', undefined);

    expect(ctx.inngest.send).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'employee/rule.extract-requested' }),
    );
  });
});

describe('handleReject — no-reason path (awaiting input rule)', () => {
  it('writes rejection feedback_event without reason when rejectionReason is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', undefined);

    expect(mockWriteFeedbackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'rejection',
        actorId: 'U-REJECTER',
        taskId: TASK_ID,
      }),
    );
  });

  it('creates employee_rule with awaiting_input status when no reason provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', undefined);

    const empRulePost = fetchMock.mock.calls.find(
      ([url, init]: [string, RequestInit]) =>
        (url as string).includes('employee_rules') && init?.method === 'POST',
    );
    expect(empRulePost).toBeDefined();
    const body = JSON.parse(empRulePost![1].body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      tenant_id: TENANT_ID,
      archetype_id: ARCHETYPE_ID,
      source: 'rejection',
      status: 'awaiting_input',
    });
  });

  it('posts feedback-solicitation message to thread when no rejectionReason', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', undefined);

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C-APPROVAL',
        thread_ts: 'ts-approval-001',
        text: expect.stringContaining('U-REJECTER'),
      }),
    );
  });

  it('does NOT post feedback-solicitation when rejectionReason is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(
      makeCtx(),
      makeDeliverable(),
      mockSlackClient,
      'U-REJECTER',
      'Use shorter text',
    );

    const solicitCalls = mockPostMessage.mock.calls.filter(
      ([opts]: [{ text?: string }]) =>
        opts.text?.includes('What should I have done differently') ?? false,
    );
    expect(solicitCalls).toHaveLength(0);
  });
});

describe('handleReject — Slack message updates', () => {
  it('updates approval message to rejected state when approvalMsgTs and targetChannel are set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(
      makeCtx(),
      makeDeliverable({
        approval_message_ts: 'ts-approval-001',
        target_channel: 'C-APPROVAL',
      }),
      mockSlackClient,
      'U-REJECTER',
      undefined,
    );

    expect(mockUpdateMessage).toHaveBeenCalledWith(
      'C-APPROVAL',
      'ts-approval-001',
      expect.stringContaining('U-REJECTER'),
      expect.any(Array),
    );
  });

  it('does NOT update approval message when approvalMsgTs is absent', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(
      makeCtx(),
      makeDeliverable({ approval_message_ts: undefined, target_channel: 'C-APPROVAL' }),
      mockSlackClient,
      'U-REJECTER',
      undefined,
    );

    expect(mockUpdateMessage).not.toHaveBeenCalledWith(
      'C-APPROVAL',
      undefined,
      expect.any(String),
      expect.any(Array),
    );
  });

  it('updates notify-received message when notifyMsgRef ts and channel are set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(
      makeCtx({ notifyMsgRef: { ts: 'ts-notify-001', channel: 'C-NOTIFY' } }),
      makeDeliverable(),
      mockSlackClient,
      'U-REJECTER',
      undefined,
    );

    expect(mockUpdateMessage).toHaveBeenCalledWith(
      'C-NOTIFY',
      'ts-notify-001',
      expect.stringContaining('U-REJECTER'),
      expect.any(Array),
    );
  });

  it('does NOT update notify-received when notifyMsgRef is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(
      makeCtx({ notifyMsgRef: null }),
      makeDeliverable(),
      mockSlackClient,
      'U-REJECTER',
      undefined,
    );

    const notifyCalls = mockUpdateMessage.mock.calls.filter(
      ([chan]: [string]) => chan === 'C-NOTIFY',
    );
    expect(notifyCalls).toHaveLength(0);
  });

  it('posts context thread reply when original_message is present in metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(
      makeCtx(),
      makeDeliverable({
        original_message: 'Hi, when is checkout?',
        approval_message_ts: 'ts-approval-001',
        target_channel: 'C-APPROVAL',
      }),
      mockSlackClient,
      'U-REJECTER',
      undefined,
    );

    expect(mockBuildContextThreadBlocks).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'reject', originalMessage: 'Hi, when is checkout?' }),
    );
    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'C-APPROVAL', thread_ts: 'ts-approval-001' }),
    );
  });

  it('posts rejection acknowledgment when rejectionReason provided and approvalMsgTs set', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(
      makeCtx(),
      makeDeliverable({
        approval_message_ts: 'ts-approval-001',
        target_channel: 'C-APPROVAL',
      }),
      mockSlackClient,
      'U-REJECTER',
      'Too verbose',
    );

    const ackCalls = mockPostMessage.mock.calls.filter(
      ([opts]: [{ text?: string }]) => opts.text?.includes('Too verbose') ?? false,
    );
    expect(ackCalls).toHaveLength(1);
  });
});

describe('handleReject — metadata flags', () => {
  it('sets rejection_feedback_requested and rejection_user_id in task metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', undefined);

    expect(mockMergeFn).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({
        rejection_feedback_requested: true,
        rejection_user_id: 'U-REJECTER',
      }),
    );
  });
});

describe('handleReject — Hostfully link in blocks', () => {
  it('builds Hostfully link when thread_uid and lead_uid are in metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(
      makeCtx(),
      makeDeliverable({ thread_uid: 'thr-aaa', lead_uid: 'lead-bbb' }),
      mockSlackClient,
      'U-REJECTER',
      undefined,
    );

    expect(mockBuildHostfullyLink).toHaveBeenCalledWith('thr-aaa', 'lead-bbb');
    expect(mockBuildTerminalBlocksWithContext).toHaveBeenCalledWith(
      expect.objectContaining({
        contextUrl: 'https://app.hostfully.com/thread/123',
      }),
    );
  });

  it('does NOT call buildHostfullyLink when metadata lacks thread_uid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));

    await handleReject(makeCtx(), makeDeliverable(), mockSlackClient, 'U-REJECTER', undefined);

    expect(mockBuildHostfullyLink).not.toHaveBeenCalled();
  });
});
