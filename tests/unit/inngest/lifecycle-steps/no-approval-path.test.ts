import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  mockLoadTenantSlack,
  mockRunDeliveryWithRetry,
  mockPatchTask,
  mockLogStatusTransition,
  mockCleanupExecutionMachine,
  mockSafeRecordWorkMetric,
  mockClearPendingApprovalByTaskId,
  mockQuery,
} = vi.hoisted(() => ({
  mockLoadTenantSlack: vi.fn(),
  mockRunDeliveryWithRetry: vi.fn(),
  mockPatchTask: vi.fn().mockResolvedValue(undefined),
  mockLogStatusTransition: vi.fn().mockResolvedValue(undefined),
  mockCleanupExecutionMachine: vi.fn().mockResolvedValue(undefined),
  mockSafeRecordWorkMetric: vi.fn().mockResolvedValue(undefined),
  mockClearPendingApprovalByTaskId: vi.fn().mockResolvedValue(undefined),
  mockQuery: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../../src/inngest/lifecycle/steps/notify-and-track.js', () => ({
  loadTenantSlack: mockLoadTenantSlack,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/delivery-retry.js', () => ({
  runDeliveryWithRetry: mockRunDeliveryWithRetry,
}));

vi.mock('../../../../src/inngest/lib/lifecycle-helpers.js', () => ({
  patchTask: mockPatchTask,
  logStatusTransition: mockLogStatusTransition,
}));

vi.mock('../../../../src/inngest/lifecycle/steps/lifecycle-helpers.js', () => ({
  cleanupExecutionMachine: mockCleanupExecutionMachine,
  safeRecordWorkMetric: mockSafeRecordWorkMetric,
}));

vi.mock('../../../../src/inngest/lib/pending-approvals.js', () => ({
  clearPendingApprovalByTaskId: mockClearPendingApprovalByTaskId,
}));

vi.mock('../../../../src/workers/lib/postgrest-client.js', () => ({
  query: mockQuery,
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

vi.mock('../../../../src/lib/slack-blocks.js', () => ({
  buildNoActionThreadBlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../../../src/lib/slack-copy.js', () => ({
  completedNoApprovalMessage: vi.fn().mockReturnValue('✅ Done'),
  missingDeliveryConfigFailureMessage: vi.fn().mockReturnValue('❌ Not configured to deliver'),
}));

import { runNoApprovalPath } from '../../../../src/inngest/lifecycle/steps/no-approval-path.js';
import type { NoApprovalPathContext } from '../../../../src/inngest/lifecycle/steps/no-approval-path.js';

const TASK_ID = 'dddd0004-0000-0000-0000-000000000000';
const ARCHETYPE_ID = 'arch0004-0000-0000-0000-000000000000';
const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-key';
const MACHINE_ID = 'docker_test-machine-no-approval';
const HEADERS = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

function makeOkFetch(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
}

function buildDeliverableFetch(content: string | null): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();
    if (method === 'PATCH' || method === 'POST') return makeOkFetch([]);
    if ((url as string).includes('/deliverables?')) {
      if (content === null) return makeOkFetch([]);
      return makeOkFetch([{ content, external_ref: TASK_ID }]);
    }
    return makeOkFetch([]);
  });
}

function makeCtx(overrides: Partial<NoApprovalPathContext> = {}): NoApprovalPathContext {
  return {
    taskId: TASK_ID,
    archetypeId: ARCHETYPE_ID,
    tenantId: TENANT_ID,
    supabaseUrl: SUPABASE_URL,
    supabaseKey: SUPABASE_KEY,
    headers: HEADERS,
    taskData: {},
    archetype: {
      role_name: 'Test Employee',
      deliverable_type: 'slack',
      delivery_steps: 'Post the output to Slack.',
    },
    machineId: MACHINE_ID,
    notifyMsgRef: { ts: 'ts-notify-001', channel: 'C-NOTIFY' },
    notifyBlocks: vi.fn().mockReturnValue([]),
    notifyStateBlocks: vi.fn().mockReturnValue([]),
    ...overrides,
  };
}

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_id: string, fn: () => Promise<unknown>) => fn()),
    waitForEvent: vi.fn().mockResolvedValue(null),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

const NO_ACTION_CONTENT = JSON.stringify({
  classification: 'NO_ACTION_NEEDED',
  confidence: 0.95,
  reasoning: 'Guest said thanks',
});

const NEEDS_APPROVAL_CONTENT = JSON.stringify({
  classification: 'NEEDS_APPROVAL',
  confidence: 0.9,
  reasoning: 'Guest asked a question',
  draftResponse: 'WiFi password is GuestNetwork.',
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('setTimeout', (fn: (...args: unknown[]) => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });
  mockLoadTenantSlack.mockResolvedValue({
    botToken: 'xoxb-test',
    channel: 'C-NOTIFY',
    tenantEnv: { SLACK_BOT_TOKEN: 'xoxb-test', NOTIFICATION_CHANNEL: 'C-NOTIFY' },
    slackClient: {
      updateMessage: vi.fn().mockResolvedValue({}),
      postMessage: vi.fn().mockResolvedValue({ ok: true, ts: 'ts-001' }),
    },
  });
  mockRunDeliveryWithRetry.mockResolvedValue({ status: 'done' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runNoApprovalPath — NO_ACTION_NEEDED + no delivery_instructions → skipDelivery', () => {
  it('patches task to Done and does NOT run delivery', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NO_ACTION_CONTENT));
    const ctx = makeCtx({ archetype: { deliverable_type: 'slack', role_name: 'Bot' } });
    const step = makeStep();

    await runNoApprovalPath(ctx, step as never);

    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Done' }),
    );
    expect(mockRunDeliveryWithRetry).not.toHaveBeenCalled();
  });

  it('cleans up execution machine before completing', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NO_ACTION_CONTENT));
    const step = makeStep();

    await runNoApprovalPath(makeCtx({ archetype: {} }), step as never);

    expect(mockCleanupExecutionMachine).toHaveBeenCalledWith(MACHINE_ID, TASK_ID);
  });

  it('records work metric on the no-action path', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NO_ACTION_CONTENT));
    const step = makeStep();

    await runNoApprovalPath(makeCtx({ archetype: {} }), step as never);

    expect(mockSafeRecordWorkMetric).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      ARCHETYPE_ID,
      TENANT_ID,
    );
  });
});

describe('runNoApprovalPath — NEEDS_APPROVAL deliverable → delivery path', () => {
  it('patches task to Delivering then runs delivery', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    const step = makeStep();

    await runNoApprovalPath(makeCtx(), step as never);

    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Delivering' }),
    );
    expect(mockRunDeliveryWithRetry).toHaveBeenCalledOnce();
  });

  it('runs delivery with approvalRequired=false', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    const step = makeStep();

    await runNoApprovalPath(makeCtx(), step as never);

    expect(mockRunDeliveryWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({ approvalRequired: false, taskId: TASK_ID }),
    );
  });

  it('records work metric after delivery', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    const step = makeStep();

    await runNoApprovalPath(makeCtx(), step as never);

    expect(mockSafeRecordWorkMetric).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      ARCHETYPE_ID,
      TENANT_ID,
    );
  });
});

describe('runNoApprovalPath — delivery result status=done → complete-after-delivery runs', () => {
  it('complete-after-delivery step is invoked when runDeliveryWithRetry returns done', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    mockRunDeliveryWithRetry.mockResolvedValue({ status: 'done' });
    const step = makeStep();

    await runNoApprovalPath(makeCtx(), step as never);

    expect(
      (step.run as ReturnType<typeof vi.fn>).mock.calls.some(
        ([id]: string[]) => id === 'complete-after-delivery-no-approval',
      ),
    ).toBe(true);
  });

  it('complete-after-delivery step is NOT invoked when runDeliveryWithRetry returns non-done status', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    mockRunDeliveryWithRetry.mockResolvedValue({ status: 'failed' });
    const step = makeStep();

    await runNoApprovalPath(makeCtx(), step as never);

    expect(
      (step.run as ReturnType<typeof vi.fn>).mock.calls.some(
        ([id]: string[]) => id === 'complete-after-delivery-no-approval',
      ),
    ).toBe(false);
  });
});

describe('runNoApprovalPath — no delivery config at all → no-delivery-escape-hatch → Done', () => {
  it('patches task to Done (not Failed) when no delivery config is set at all', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    const step = makeStep();
    const ctx = makeCtx({ archetype: { role_name: 'Bot' } });

    await runNoApprovalPath(ctx, step as never);

    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Done' }),
    );
    expect(mockRunDeliveryWithRetry).not.toHaveBeenCalled();
  });

  it('still cleans up the execution machine on the failure path', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    const step = makeStep();
    const ctx = makeCtx({ archetype: { role_name: 'Bot' } });

    await runNoApprovalPath(ctx, step as never);

    expect(mockCleanupExecutionMachine).toHaveBeenCalledWith(MACHINE_ID, TASK_ID);
  });
});

describe('runNoApprovalPath — NO_ACTION_NEEDED + no deliverable_type → benign Done', () => {
  it('completes to Done (not Failed) when there is genuinely nothing to deliver', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NO_ACTION_CONTENT));
    const step = makeStep();
    const ctx = makeCtx({ archetype: { role_name: 'Bot' } });

    await runNoApprovalPath(ctx, step as never);

    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Done' }),
    );
    expect(mockRunDeliveryWithRetry).not.toHaveBeenCalled();
  });
});

describe('runNoApprovalPath — no deliverable found after retries → falls through to delivery', () => {
  it('runs delivery when no deliverable row exists (safe fallback)', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(null));
    const step = makeStep();

    await runNoApprovalPath(makeCtx(), step as never);

    expect(mockRunDeliveryWithRetry).toHaveBeenCalledOnce();
  });
});

describe('runNoApprovalPath — NO_ACTION_NEEDED with delivery_steps → runs delivery', () => {
  it('proceeds to delivery when NO_ACTION_NEEDED but delivery_steps is set', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NO_ACTION_CONTENT));
    const step = makeStep();
    const ctx = makeCtx({
      archetype: {
        role_name: 'Bot',
        deliverable_type: 'slack',
        delivery_steps: 'Always post to Slack.',
      },
    });

    await runNoApprovalPath(ctx, step as never);

    expect(mockRunDeliveryWithRetry).toHaveBeenCalledOnce();
    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Delivering' }),
    );
  });
});
