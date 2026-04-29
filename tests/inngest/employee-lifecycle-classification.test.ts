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

const TEST_TASK_ID = '22222222-2222-2222-2222-222222222222';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000002';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000012';

const inngest = new Inngest({ id: 'ai-employee-test-classification' });

function makeMockTaskData() {
  return {
    id: TEST_TASK_ID,
    tenant_id: TEST_TENANT_ID,
    status: 'Ready',
    archetypes: {
      id: TEST_ARCHETYPE_ID,
      // approval_required: true is CRITICAL — otherwise the !approvalRequired
      // short-circuit fires before check-classification is reached
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

function buildClassificationFetchMock(deliverableContent: string | null): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if ((url as string).includes('/deliverables?')) {
      if (deliverableContent === null) return makeOkFetchResponse([]);
      return makeOkFetchResponse([{ content: deliverableContent }]);
    }

    if (method === 'PATCH' || method === 'POST') {
      return makeOkFetchResponse([]);
    }

    return makeOkFetchResponse([]);
  });
}

function makeClassificationEngine(deliverableContent: string | null) {
  const fetchMock = buildClassificationFetchMock(deliverableContent);
  vi.stubGlobal('fetch', fetchMock);

  const stepRunMock = vi.fn().mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
    switch (id) {
      case 'load-task':
        return makeMockTaskData();
      case 'executing':
        return 'mock-machine-id';
      case 'poll-completion':
        return 'Submitting';
      case 'check-classification':
        return fn();
      case 'complete-no-action':
        return fn();
      case 'cleanup-no-action':
        return fn();
      case 'complete-no-action-timeout':
        return fn();
      case 'mark-reply-anyway-override':
        return fn();
      case 'build-reply-context':
        return fn();
      case 'reply-anyway-execute':
        return 'mock-reply-machine-id';
      case 'reply-anyway-poll':
        return fn();
      case 'set-reviewing':
        return undefined;
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

  return { engine, fetchMock, stepRunMock, waitForEventMock };
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

  // Make setTimeout resolve immediately so the 1-second retry delay
  // in check-classification does not block tests
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

describe('employee-lifecycle — classification flow (check-classification step)', () => {
  it('NO_ACTION_NEEDED deliverable → task patched to Done, never enters Reviewing', async () => {
    const noActionContent = JSON.stringify({
      classification: 'NO_ACTION_NEEDED',
      confidence: 0.95,
      reasoning: 'Guest said thanks',
      draftResponse: null,
      summary: 'Acknowledgment',
      category: 'acknowledgment',
      conversationSummary: null,
      urgency: false,
    });
    const { engine, fetchMock, stepRunMock, waitForEventMock } =
      makeClassificationEngine(noActionContent);

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(findPatchWithStatus(fetchMock, 'Done')).toBeDefined();
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(false);
    // waitForEvent IS called now (24h Reply Anyway window), returns null (timeout) → Done
    expect(waitForEventMock).toHaveBeenCalledWith(
      'wait-for-reply-anyway',
      expect.objectContaining({ event: 'employee/reply-anyway.requested' }),
    );
  });

  it('NEEDS_APPROVAL deliverable → falls through to Reviewing', async () => {
    const needsApprovalContent = JSON.stringify({
      classification: 'NEEDS_APPROVAL',
      confidence: 0.85,
      reasoning: 'Guest asking about WiFi',
      draftResponse: 'WiFi is GuestNetwork',
      summary: 'WiFi request',
      category: 'wifi',
      conversationSummary: null,
      urgency: false,
    });
    const { engine, fetchMock, stepRunMock } = makeClassificationEngine(needsApprovalContent);

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(true);
    expect(findPatchWithStatus(fetchMock, 'Done')).toBeUndefined();
  });

  it('non-JSON early-exit string → treated as NO_ACTION_NEEDED, task goes to Done', async () => {
    const earlyExitContent = 'NO_ACTION_NEEDED: No unresponded guest messages found.';
    const { engine, fetchMock, stepRunMock, waitForEventMock } =
      makeClassificationEngine(earlyExitContent);

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(findPatchWithStatus(fetchMock, 'Done')).toBeDefined();
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(false);
    expect(waitForEventMock).toHaveBeenCalledWith(
      'wait-for-reply-anyway',
      expect.objectContaining({ event: 'employee/reply-anyway.requested' }),
    );
  });

  it('malformed deliverable content → defaults to NEEDS_APPROVAL, task enters Reviewing', async () => {
    const malformedContent = 'this is not JSON at all';
    const { engine, fetchMock, stepRunMock } = makeClassificationEngine(malformedContent);

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(true);
    expect(findPatchWithStatus(fetchMock, 'Done')).toBeUndefined();
  });

  it('no deliverable found after retries → proceeds to Reviewing (safe default)', async () => {
    const { engine, fetchMock, stepRunMock } = makeClassificationEngine(null);

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();
    expect(
      (stepRunMock.mock.calls as Array<[string, unknown]>).some(([id]) => id === 'set-reviewing'),
    ).toBe(true);
    expect(findPatchWithStatus(fetchMock, 'Done')).toBeUndefined();
  });
});
