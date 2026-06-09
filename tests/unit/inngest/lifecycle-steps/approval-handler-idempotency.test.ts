import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';

const mockPatchTask = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockLogStatusTransition = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockClearPendingApprovalByTaskId = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockMergeTaskMetadata = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockWriteFeedbackEvent = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockBuildTerminalBlocksWithContext = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockBuildContextThreadBlocks = vi.hoisted(() => vi.fn().mockReturnValue([]));
const mockBuildHostfullyLink = vi.hoisted(() =>
  vi.fn().mockReturnValue('https://app.hostfully.com/thread/test'),
);
const mockLoadTenantEnv = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test' }),
);

vi.mock('../../../../src/inngest/lib/lifecycle-helpers.js', () => ({
  patchTask: mockPatchTask,
  logStatusTransition: mockLogStatusTransition,
}));

vi.mock('../../../../src/inngest/lib/pending-approvals.js', () => ({
  clearPendingApprovalByTaskId: mockClearPendingApprovalByTaskId,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/lifecycle-helpers.js', () => ({
  mergeTaskMetadata: mockMergeTaskMetadata,
  writeFeedbackEvent: mockWriteFeedbackEvent,
}));

vi.mock('../../../../src/lib/slack-blocks.js', () => ({
  buildTerminalBlocksWithContext: mockBuildTerminalBlocksWithContext,
  buildContextThreadBlocks: mockBuildContextThreadBlocks,
  buildSupersededBlocks: vi.fn().mockReturnValue([]),
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

vi.mock('../../../../src/lib/slack-copy.js', () => ({
  expiredMessage: vi.fn().mockReturnValue('This message has expired.'),
  supersededMessage: vi.fn().mockReturnValue('A newer message supersedes this one.'),
  needsReviewMessage: vi.fn().mockReturnValue('Needs review.'),
}));

vi.mock('../../../../src/repositories/tenant-env-loader.js', () => ({
  loadTenantEnv: mockLoadTenantEnv,
}));

vi.mock('../../../../src/repositories/tenant-repository.js', () => ({
  TenantRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../../../src/repositories/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
  Prisma: { JsonNull: 'JsonNull' },
}));

import { handleApprove } from '../../../../src/inngest/lifecycle/steps/approval-handler.js';
import type { ApprovalHandlerContext } from '../../../../src/inngest/lifecycle/steps/approval-handler.js';

const TASK_ID = 'aaaa0001-0000-0000-0000-000000000000';
const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const ARCHETYPE_ID = 'arch0001-0000-0000-0000-000000000000';
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-key';
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

const APPROVAL_MSG_TS = 'ts-approval-001';
const TARGET_CHANNEL = 'C-APPROVAL-CHANNEL';

const mockUpdateMessage = vi.fn().mockResolvedValue({});
const mockPostMessage = vi.fn().mockResolvedValue({ ok: true, ts: 'ts-context-reply' });

const mockSlackClient = {
  updateMessage: mockUpdateMessage,
  postMessage: mockPostMessage,
} as unknown as ReturnType<typeof import('../../../../src/lib/slack-client.js').createSlackClient>;

function makeCtx(
  runDelivery: ApprovalHandlerContext['runDelivery'],
  overrides: Partial<ApprovalHandlerContext> = {},
): ApprovalHandlerContext {
  const inngest = new Inngest({ id: 'test-approve-idempotency' });
  vi.spyOn(inngest, 'send').mockResolvedValue(undefined as never);
  return {
    taskId: TASK_ID,
    tenantId: TENANT_ID,
    archetypeId: ARCHETYPE_ID,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    headers: HEADERS,
    archetype: { role_name: 'Test Employee', delivery_instructions: 'Deliver the content.' },
    notifyMsgRef: { ts: 'ts-notify-001', channel: 'C-NOTIFY' },
    notifyBlocks: vi.fn().mockReturnValue([]),
    notifyStateBlocks: vi.fn().mockReturnValue([]),
    inngest,
    runDelivery,
    ...overrides,
  };
}

function makeDeliverable(metadataOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'deliv-001',
    content: JSON.stringify({ draft: 'Draft reply for the guest.' }),
    metadata: {
      approval_message_ts: APPROVAL_MSG_TS,
      target_channel: TARGET_CHANNEL,
      ...metadataOverrides,
    },
  };
}

function makeFetchStub(
  deliveryInstructions = 'Send the approved reply via Hostfully.',
): typeof fetch {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if ((url as string).includes('archetypes(delivery_instructions)')) {
      return {
        ok: true,
        json: async () => [{ archetypes: { delivery_instructions: deliveryInstructions } }],
      };
    }

    if (method === 'PATCH' || method === 'POST') {
      return { ok: true, json: async () => [] };
    }

    return { ok: true, json: async () => [] };
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('handleApprove — approval idempotency (lifecycle-step layer)', () => {
  /**
   * Primary test: a single approval event triggers delivery exactly once.
   *
   * In the reviewing path, `step.waitForEvent` is a one-time Inngest listener.
   * Only one `employee/approval.received` event is consumed per lifecycle run.
   * This test verifies the happy path: one approve → one delivery call.
   */
  it('triggers delivery exactly once on first approval', async () => {
    vi.stubGlobal('fetch', makeFetchStub());
    const mockRunDelivery = vi.fn().mockResolvedValue({ status: 'done' });

    await handleApprove(
      makeCtx(mockRunDelivery),
      makeDeliverable(),
      mockSlackClient,
      'U-APPROVER',
      undefined,
      {},
    );

    expect(mockRunDelivery).toHaveBeenCalledTimes(1);
  });

  it('patches task status Approved then Delivering in order', async () => {
    vi.stubGlobal('fetch', makeFetchStub());
    const mockRunDelivery = vi.fn().mockResolvedValue({ status: 'done' });
    const statusSequence: string[] = [];
    mockPatchTask.mockImplementation(
      (_url: string, _headers: unknown, _taskId: string, data: { status?: string }) => {
        if (data.status) statusSequence.push(data.status);
        return Promise.resolve(undefined);
      },
    );

    await handleApprove(
      makeCtx(mockRunDelivery),
      makeDeliverable(),
      mockSlackClient,
      'U-APPROVER',
      undefined,
      {},
    );

    expect(statusSequence).toContain('Approved');
    expect(statusSequence).toContain('Delivering');
    expect(statusSequence.indexOf('Approved')).toBeLessThan(statusSequence.indexOf('Delivering'));
  });

  it('(current behaviour) second direct call re-triggers runDelivery — idempotency is Inngest-level only', async () => {
    vi.stubGlobal('fetch', makeFetchStub());
    const mockRunDelivery = vi.fn().mockResolvedValue({ status: 'done' });
    const ctx = makeCtx(mockRunDelivery);

    await handleApprove(ctx, makeDeliverable(), mockSlackClient, 'U-APPROVER-1', undefined, {});
    expect(mockRunDelivery).toHaveBeenCalledTimes(1);

    // BUG: handleApprove has no in-function idempotency guard.  A second call for the
    // same task — simulating a double-click on the Approve button — unconditionally
    // patches state again and calls runDelivery a second time.  Production safety relies
    // solely on step.waitForEvent firing exactly once per Inngest lifecycle run so this
    // code path is never reached twice.  A future fix should check task status first.
    await handleApprove(ctx, makeDeliverable(), mockSlackClient, 'U-APPROVER-2', undefined, {});
    expect(mockRunDelivery).toHaveBeenCalledTimes(2);
  });

  it('does not call runDelivery when delivery_instructions are missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
        if ((url as string).includes('archetypes(delivery_instructions)')) {
          return { ok: true, json: async () => [{ archetypes: { delivery_instructions: null } }] };
        }
        if (method === 'PATCH' || method === 'POST') return { ok: true, json: async () => [] };
        return { ok: true, json: async () => [] };
      }) as unknown as typeof fetch,
    );
    const mockRunDelivery = vi.fn().mockResolvedValue({ status: 'done' });

    await handleApprove(
      makeCtx(mockRunDelivery),
      makeDeliverable(),
      mockSlackClient,
      'U-APPROVER',
      undefined,
      {},
    );

    expect(mockRunDelivery).not.toHaveBeenCalled();
    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Failed' }),
    );
  });
});
