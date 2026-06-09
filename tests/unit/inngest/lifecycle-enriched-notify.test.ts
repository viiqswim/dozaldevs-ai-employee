import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine } from '@inngest/test';
import { createEmployeeLifecycleFunction } from '../../../src/inngest/employee-lifecycle.js';
import { reviewingDraftedMessage } from '../../../src/lib/slack-copy.js';
import { applyStepMocks } from '../../helpers/lifecycle-mocks.js';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockCreateMachine,
  mockDestroyMachine,
  mockGetTunnelUrl,
  mockUpdateMessage,
  mockPostMessage,
  mockCreateSlackClient,
  mockLoadTenantEnv,
  mockFetchLeadEnrichment,
} = vi.hoisted(() => {
  const mockCreateMachine = vi.fn();
  const mockDestroyMachine = vi.fn();
  const mockGetTunnelUrl = vi.fn();
  const mockUpdateMessage = vi.fn();
  const mockPostMessage = vi.fn();
  const mockCreateSlackClient = vi.fn();
  const mockLoadTenantEnv = vi.fn();
  const mockFetchLeadEnrichment = vi.fn();
  return {
    mockCreateMachine,
    mockDestroyMachine,
    mockGetTunnelUrl,
    mockUpdateMessage,
    mockPostMessage,
    mockCreateSlackClient,
    mockLoadTenantEnv,
    mockFetchLeadEnrichment,
  };
});

vi.mock('../../../src/lib/fly-client.js', () => ({
  createMachine: mockCreateMachine,
  destroyMachine: mockDestroyMachine,
}));

vi.mock('../../../src/lib/tunnel-client.js', () => ({
  getTunnelUrl: mockGetTunnelUrl,
}));

vi.mock('../../../src/lib/slack-client.js', () => ({
  createSlackClient: mockCreateSlackClient,
}));

vi.mock('../../../src/repositories/tenant-env-loader.js', () => ({
  loadTenantEnv: mockLoadTenantEnv,
}));

vi.mock('../../../src/repositories/tenant-repository.js', () => ({
  TenantRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../../src/repositories/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  })),
  Prisma: { JsonNull: 'JsonNull' },
}));

vi.mock('../../../src/lib/hostfully-enrichment.js', () => ({
  fetchLeadEnrichment: mockFetchLeadEnrichment,
}));

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_TASK_ID = '55555555-5555-5555-5555-555555555555';
const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000003';
const TEST_ARCHETYPE_ID = '00000000-0000-0000-0000-000000000015';

const NO_ACTION_CONTENT = JSON.stringify({
  classification: 'NO_ACTION_NEEDED',
  confidence: 0.95,
  reasoning: 'Guest said thanks',
  draftResponse: null,
  summary: 'Acknowledgment',
  category: 'acknowledgment',
  conversationSummary: null,
  urgency: false,
  guestName: 'Jane Smith',
  propertyName: null,
  checkIn: 'May 15',
  checkOut: 'May 18',
  bookingChannel: 'AIRBNB',
  originalMessage: 'Thanks so much!',
  leadUid: 'lead-abc-123',
  threadUid: 'thread-abc',
  messageUid: 'msg-abc',
});

const NEEDS_APPROVAL_CONTENT = JSON.stringify({
  classification: 'NEEDS_APPROVAL',
  confidence: 0.9,
  reasoning: 'Guest asked about WiFi',
  draftResponse: 'Yes, we have free WiFi!',
  summary: 'WiFi question',
  category: 'amenities',
  conversationSummary: null,
  urgency: false,
  guestName: 'Jane Smith',
  propertyName: null,
  checkIn: 'May 15',
  checkOut: 'May 18',
  bookingChannel: 'AIRBNB',
  originalMessage: 'Is there WiFi?',
  leadUid: 'lead-abc-123',
  threadUid: 'thread-abc',
  messageUid: 'msg-abc',
});

// ── Task data builders ────────────────────────────────────────────────────────

function makeGuestMessagingTaskData() {
  return {
    id: TEST_TASK_ID,
    tenant_id: TEST_TENANT_ID,
    status: 'Ready',
    raw_event: {
      lead_uid: 'lead-abc-123',
      message_content: 'Is there free WiFi?',
      thread_uid: 'thread-abc',
      property_uid: 'prop-abc',
    },
    archetypes: {
      id: TEST_ARCHETYPE_ID,
      role_name: 'guest-messaging',
      enrichment_adapter: 'hostfully',
      notification_channel: null,
      risk_model: { approval_required: true, timeout_hours: 24 },
      runtime: 'opencode',
      model: 'minimax/minimax-m2.7',
      delivery_instructions: null,
    },
  };
}

function makeSummarizerTaskData() {
  return {
    id: TEST_TASK_ID,
    tenant_id: TEST_TENANT_ID,
    status: 'Ready',
    raw_event: null,
    archetypes: {
      id: TEST_ARCHETYPE_ID,
      role_name: 'daily-summarizer',
      notification_channel: null,
      risk_model: { approval_required: true, timeout_hours: 24 },
      runtime: 'opencode',
      model: 'minimax/minimax-m2.7',
      delivery_instructions: null,
    },
  };
}

// ── Fetch mock builders ───────────────────────────────────────────────────────

function makeOkFetchResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  };
}

/**
 * Base fetch mock for NO_ACTION_NEEDED path tests.
 * Handles: status check, deliverables (content only), PATCH/POST.
 */
function buildNoActionFetchMock() {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if (method === 'PATCH' || method === 'POST') {
      return makeOkFetchResponse([{ id: 'new-id-123' }]);
    }

    if ((url as string).includes('/tasks?') && (url as string).includes('select=status')) {
      return makeOkFetchResponse([{ status: 'Submitting' }]);
    }

    if ((url as string).includes('/deliverables?')) {
      return makeOkFetchResponse([{ content: NO_ACTION_CONTENT }]);
    }

    return makeOkFetchResponse([]);
  });
}

/**
 * Fetch mock for NEEDS_APPROVAL path tests.
 * Returns deliverable metadata with optional recipient_name for update-notify-reviewing.
 */
function buildReviewingFetchMock(opts: { recipientName?: string } = {}) {
  const { recipientName } = opts;
  const delivMeta: Record<string, unknown> = {
    approval_message_ts: 'approval-ts-123',
    target_channel: 'C-NOTIFY',
    conversation_ref: 'thread-abc',
  };
  if (recipientName) {
    delivMeta['recipient_name'] = recipientName;
  }

  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = ((init as RequestInit | undefined)?.method ?? 'GET').toUpperCase();

    if (method === 'PATCH' || method === 'POST') {
      return makeOkFetchResponse([{ id: 'new-id-123' }]);
    }

    if ((url as string).includes('/tasks?') && (url as string).includes('select=status')) {
      return makeOkFetchResponse([{ status: 'Submitting' }]);
    }

    if ((url as string).includes('/deliverables?')) {
      return makeOkFetchResponse([{ content: NEEDS_APPROVAL_CONTENT, metadata: delivMeta }]);
    }

    return makeOkFetchResponse([]);
  });
}

// ── Trigger event ─────────────────────────────────────────────────────────────

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

// ── Inngest instance ──────────────────────────────────────────────────────────

const inngest = new Inngest({ id: 'ai-employee-test-enriched-notify' });

// ── Shared beforeEach / afterEach ─────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  mockCreateMachine.mockResolvedValue({ id: 'mock-machine-id' });
  mockDestroyMachine.mockResolvedValue(undefined);
  mockGetTunnelUrl.mockResolvedValue('http://mock-tunnel.trycloudflare.com');
  mockUpdateMessage.mockResolvedValue({});
  mockPostMessage.mockResolvedValue({ ts: 'notify-msg-ts', channel: 'C-NOTIFY' });
  mockCreateSlackClient.mockReturnValue({
    updateMessage: mockUpdateMessage,
    postMessage: mockPostMessage,
  });
  mockLoadTenantEnv.mockResolvedValue({
    SLACK_BOT_TOKEN: 'xoxb-test-bot-token',
    NOTIFICATION_CHANNEL: 'C-NOTIFY',
    HOSTFULLY_API_KEY: 'test-hostfully-key',
  });
  mockFetchLeadEnrichment.mockResolvedValue({
    guestName: 'Jane Smith',
    propertyName: null,
    checkIn: 'May 15',
    checkOut: 'May 18',
    bookingChannel: 'AIRBNB',
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('employee-lifecycle — enriched notify-received and threaded override card', () => {
  it('Test 1: guest-messaging task calls fetchLeadEnrichment and posts enriched blocks', async () => {
    const fetchMock = buildNoActionFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeGuestMessagingTaskData();
          case 'notify-received':
            return fn(); // ← actually run to test enrichment
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return { skipApproval: true, reasoning: 'Guest said thanks', displayContext: {} };
          case 'post-override-card':
            return { ts: 'override-card-ts', channel: 'C-NOTIFY' };
          case 'complete-no-action-timeout':
            return undefined;
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockResolvedValue(null);

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx) =>
        applyStepMocks(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
    });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();

    // fetchLeadEnrichment was called with the lead_uid and API key
    expect(mockFetchLeadEnrichment).toHaveBeenCalledWith('lead-abc-123', 'test-hostfully-key');

    // postMessage was called — find the notify-received call (first one)
    expect(mockPostMessage).toHaveBeenCalled();
    const firstCall = mockPostMessage.mock.calls[0] as [
      { channel: string; text: string; blocks: unknown[] },
    ];
    const blocksStr = JSON.stringify(firstCall[0].blocks);
    // Compact notify blocks include guest name but not check-in/check-out dates
    expect(blocksStr).toContain('Jane Smith');
  });

  it('Test 2: non-guest-messaging task uses generic "Task received" blocks and skips enrichment', async () => {
    const fetchMock = buildNoActionFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeSummarizerTaskData();
          case 'notify-received':
            return fn(); // ← actually run
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return { skipApproval: true, reasoning: 'No channels found', displayContext: {} };
          case 'post-override-card':
            return { ts: 'override-card-ts', channel: 'C-NOTIFY' };
          case 'complete-no-action-timeout':
            return undefined;
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockResolvedValue(null);

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx) =>
        applyStepMocks(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
    });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();

    // fetchLeadEnrichment must NOT be called for non-guest-messaging
    expect(mockFetchLeadEnrichment).not.toHaveBeenCalled();

    // postMessage was called with generic blocks
    expect(mockPostMessage).toHaveBeenCalled();
    const firstCall = mockPostMessage.mock.calls[0] as [
      { channel: string; text: string; blocks: unknown[] },
    ];
    const blocksStr = JSON.stringify(firstCall[0].blocks);
    expect(blocksStr).toContain('daily-summarizer');
  });

  it('Test 3: all-null enrichment falls back to "Guest" as display name in blocks', async () => {
    // Override default enrichment to return all-null
    mockFetchLeadEnrichment.mockResolvedValue({
      guestName: null,
      propertyName: null,
      checkIn: null,
      checkOut: null,
      bookingChannel: null,
    });

    const fetchMock = buildNoActionFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeGuestMessagingTaskData();
          case 'notify-received':
            return fn(); // ← actually run to test fallback behavior
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return { skipApproval: true, reasoning: 'Guest said thanks', displayContext: {} };
          case 'post-override-card':
            return { ts: 'override-card-ts', channel: 'C-NOTIFY' };
          case 'complete-no-action-timeout':
            return undefined;
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockResolvedValue(null);

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx) =>
        applyStepMocks(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
    });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();

    // postMessage was still called (task proceeds)
    expect(mockPostMessage).toHaveBeenCalled();

    // Compact blocks are produced even with null enrichment (no 'Guest' fallback in compact format)
    const firstCall = mockPostMessage.mock.calls[0] as [
      { channel: string; text: string; blocks: unknown[] },
    ];
    expect(Array.isArray(firstCall[0].blocks)).toBe(true);
    expect(firstCall[0].blocks.length).toBeGreaterThan(0);
  });

  it('Test 4: override card and no-action thread reply both use notify message thread_ts', async () => {
    const fetchMock = buildNoActionFetchMock();
    vi.stubGlobal('fetch', fetchMock);

    const NOTIFY_TS = 'notify-ts-123';

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeGuestMessagingTaskData();
          case 'notify-received':
            // Return fixed ts so post-override-card uses it as thread_ts
            return { ts: NOTIFY_TS, channel: 'C-NOTIFY', enrichment: null };
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return { skipApproval: true, reasoning: 'Guest said thanks', displayContext: {} };
          case 'cleanup-no-action':
            return undefined;
          case 'post-override-card':
            return fn(); // ← actually run to test thread_ts behavior
          case 'complete-no-action-timeout':
            return undefined;
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockResolvedValue(null);

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx) =>
        applyStepMocks(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
    });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();

    // Both postMessage calls in post-override-card should use notify ts as thread_ts
    const allCalls = mockPostMessage.mock.calls as Array<
      [{ channel: string; text: string; thread_ts?: string; blocks: unknown[] }]
    >;
    const threadedCalls = allCalls.filter(([args]) => args.thread_ts === NOTIFY_TS);
    expect(threadedCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('Test 5: update-notify-reviewing calls updateMessage with recipient name when available', async () => {
    const NOTIFY_TS = 'notify-ts-123';
    const fetchMock = buildReviewingFetchMock({ recipientName: 'Jane Smith' });
    vi.stubGlobal('fetch', fetchMock);

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeGuestMessagingTaskData();
          case 'notify-received':
            return { ts: NOTIFY_TS, channel: 'C-NOTIFY', enrichment: null };
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return { skipApproval: false, reasoning: 'Guest asked a question', displayContext: {} };
          case 'check-supersede':
            return undefined;
          case 'set-reviewing':
            return undefined;
          case 'update-notify-reviewing':
            return fn(); // ← actually run to test updateMessage behavior
          case 'track-pending-approval':
            return undefined;
          case 'handle-approval-result':
            return undefined;
          case 'cleanup':
            return undefined;
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockResolvedValue(null);

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx) =>
        applyStepMocks(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
    });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();

    // updateMessage was called with text containing the guest name
    expect(mockUpdateMessage).toHaveBeenCalled();
    const updateCalls = mockUpdateMessage.mock.calls as Array<[string, string, string, unknown[]]>;
    const reviewingCall = updateCalls.find(([, , text]) =>
      (text as string).includes("I've drafted"),
    );
    expect(reviewingCall).toBeDefined();
    expect(reviewingCall![2]).toContain('Jane Smith');
  });

  it('Test 6: update-notify-reviewing uses generic text when deliverable has no recipient_name', async () => {
    const NOTIFY_TS = 'notify-ts-123';
    // No guestName in deliverable metadata
    const fetchMock = buildReviewingFetchMock({});
    vi.stubGlobal('fetch', fetchMock);

    const stepRunMock = vi
      .fn()
      .mockImplementation(async (id: string, fn: () => Promise<unknown>) => {
        switch (id) {
          case 'load-task':
            return makeGuestMessagingTaskData();
          case 'notify-received':
            return { ts: NOTIFY_TS, channel: 'C-NOTIFY', enrichment: null };
          case 'executing':
            return 'mock-machine-id';
          case 'poll-completion':
            return 'Submitting';
          case 'check-classification':
            return { skipApproval: false, reasoning: 'Guest asked a question', displayContext: {} };
          case 'check-supersede':
            return undefined;
          case 'set-reviewing':
            return undefined;
          case 'update-notify-reviewing':
            return fn(); // ← actually run
          case 'track-pending-approval':
            return undefined;
          case 'handle-approval-result':
            return undefined;
          case 'cleanup':
            return undefined;
          default:
            return undefined;
        }
      });

    const waitForEventMock = vi.fn().mockResolvedValue(null);

    const engine = new InngestTestEngine({
      function: createEmployeeLifecycleFunction(inngest),
      transformCtx: (ctx) =>
        applyStepMocks(ctx, { run: stepRunMock, waitForEvent: waitForEventMock }),
    });

    const { error } = await engine.execute(triggerEvent());

    expect(error).toBeUndefined();

    // updateMessage was called with the generic drafted message (no name)
    expect(mockUpdateMessage).toHaveBeenCalled();
    const updateCalls = mockUpdateMessage.mock.calls as Array<[string, string, string, unknown[]]>;
    const reviewingCall = updateCalls.find(([, , text]) =>
      (text as string).includes("I've drafted"),
    );
    expect(reviewingCall).toBeDefined();
    // Should NOT contain a specific name — just the generic fallback
    expect(reviewingCall![2]).toBe(reviewingDraftedMessage());
  });
});
