import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// RED-phase: encodes the post-fix contract where delivery readiness is driven
// by delivery_steps (canonical, delivery_instructions fallback) rather than
// deliverable_type. Expected to FAIL against current code, which gates on
// deliverable_type only.

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

vi.mock('../../src/inngest/lifecycle/steps/notify-and-track.js', () => ({
  loadTenantSlack: mockLoadTenantSlack,
}));

vi.mock('../../src/inngest/lifecycle/steps/delivery-retry.js', () => ({
  runDeliveryWithRetry: mockRunDeliveryWithRetry,
}));

vi.mock('../../src/inngest/lib/lifecycle-helpers.js', () => ({
  patchTask: mockPatchTask,
  logStatusTransition: mockLogStatusTransition,
}));

vi.mock('../../src/inngest/lifecycle/steps/lifecycle-helpers.js', () => ({
  cleanupExecutionMachine: mockCleanupExecutionMachine,
  safeRecordWorkMetric: mockSafeRecordWorkMetric,
}));

vi.mock('../../src/inngest/lib/pending-approvals.js', () => ({
  clearPendingApprovalByTaskId: mockClearPendingApprovalByTaskId,
}));

vi.mock('../../src/workers/lib/postgrest-client.js', () => ({
  query: mockQuery,
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
  Prisma: { JsonNull: 'JsonNull' },
}));

vi.mock('../../src/lib/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../src/lib/slack-blocks.js', () => ({
  buildNoActionThreadBlocks: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/lib/slack-copy.js', () => ({
  completedNoApprovalMessage: vi.fn().mockReturnValue('✅ Done'),
  missingDeliveryConfigFailureMessage: vi.fn().mockReturnValue('❌ Not configured to deliver'),
}));

import { runNoApprovalPath } from '../../src/inngest/lifecycle/steps/no-approval-path.js';
import type { NoApprovalPathContext } from '../../src/inngest/lifecycle/steps/no-approval-path.js';

const TASK_ID = 'eeee0005-0000-0000-0000-000000000000';
const ARCHETYPE_ID = 'arch0005-0000-0000-0000-000000000000';
const TENANT_ID = '00000000-0000-0000-0000-000000000003';
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-key';
const MACHINE_ID = 'docker_test-machine-delivery-gate';
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
    },
    machineId: MACHINE_ID,
    notifyMsgRef: { ts: 'ts-notify-005', channel: 'C-NOTIFY' },
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
  reasoning: 'Direct action already taken — nothing to deliver',
});

const NEEDS_APPROVAL_CONTENT = JSON.stringify({
  classification: 'NEEDS_APPROVAL',
  confidence: 0.9,
  reasoning: 'Produced a deliverable that should reach the user',
  draftResponse: 'Here is the requested output.',
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

describe('runNoApprovalPath — (a) THE BUG CASE: NEEDS_APPROVAL + valid delivery_steps + null deliverable_type → delivers', () => {
  it('proceeds to delivery (does NOT emit MISSING_DELIVERY_CONFIG) when delivery_steps is set', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    const step = makeStep();
    const ctx = makeCtx({
      archetype: {
        role_name: 'Bot',
        delivery_steps: 'Publish the finished output to the configured channel.',
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
    expect(mockPatchTask).not.toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ failure_code: 'MISSING_DELIVERY_CONFIG' }),
    );
  });

  it('runs delivery with approvalRequired=false on the bug case', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    const step = makeStep();
    const ctx = makeCtx({
      archetype: {
        role_name: 'Bot',
        delivery_steps: 'Publish the finished output to the configured channel.',
      },
    });

    await runNoApprovalPath(ctx, step as never);

    expect(mockRunDeliveryWithRetry).toHaveBeenCalledWith(
      expect.objectContaining({ approvalRequired: false, taskId: TASK_ID }),
    );
  });
});

describe('runNoApprovalPath — (b) escape hatch preserved: NO_ACTION_NEEDED + null delivery → Done', () => {
  it('completes to Done (not Failed) when there is genuinely nothing to deliver', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NO_ACTION_CONTENT));
    const step = makeStep();
    const ctx = makeCtx({
      archetype: {
        role_name: 'Bot',
        delivery_steps: null,
        delivery_instructions: null,
        deliverable_type: null,
      },
    });

    await runNoApprovalPath(ctx, step as never);

    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Done' }),
    );
    expect(mockRunDeliveryWithRetry).not.toHaveBeenCalled();
    expect(mockPatchTask).not.toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Failed' }),
    );
  });
});

describe('runNoApprovalPath — (c) misconfigured: deliverable_type set + empty delivery → MISSING_DELIVERY_CONFIG', () => {
  it('fails visibly with MISSING_DELIVERY_CONFIG when a deliverable was declared but there is nothing to deliver', async () => {
    vi.stubGlobal('fetch', buildDeliverableFetch(NEEDS_APPROVAL_CONTENT));
    const step = makeStep();
    const ctx = makeCtx({
      archetype: {
        role_name: 'Bot',
        deliverable_type: 'slack',
        delivery_steps: null,
        delivery_instructions: null,
      },
    });

    await runNoApprovalPath(ctx, step as never);

    expect(mockPatchTask).toHaveBeenCalledWith(
      SUPABASE_URL,
      HEADERS,
      TASK_ID,
      expect.objectContaining({ status: 'Failed', failure_code: 'MISSING_DELIVERY_CONFIG' }),
    );
    expect(mockRunDeliveryWithRetry).not.toHaveBeenCalled();
  });
});
