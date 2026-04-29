import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { createInteractionHandlerFunction } from '../../src/inngest/interaction-handler.js';

const {
  mockCallLLM,
  mockLoadTenantEnv,
  mockClassifyIntent,
  mockResolveArchetypeFromTask,
  mockResolveArchetypeFromChannel,
} = vi.hoisted(() => ({
  mockCallLLM: vi.fn().mockResolvedValue({ content: 'Acknowledged!', usage: {} }),
  mockLoadTenantEnv: vi.fn().mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test' }),
  mockClassifyIntent: vi.fn().mockResolvedValue('feedback'),
  mockResolveArchetypeFromTask: vi
    .fn()
    .mockResolvedValue({ id: 'arch-1', role_name: 'Papi Chulo', tenantId: 'tenant-1' }),
  mockResolveArchetypeFromChannel: vi
    .fn()
    .mockResolvedValue({ id: 'arch-1', role_name: 'Papi Chulo', notification_channel: null }),
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => ({ $disconnect: vi.fn().mockResolvedValue(undefined) })),
}));
vi.mock('../../src/gateway/services/tenant-env-loader.js', () => ({
  loadTenantEnv: mockLoadTenantEnv,
}));
vi.mock('../../src/gateway/services/tenant-repository.js', () => ({
  TenantRepository: vi.fn(() => ({})),
}));
vi.mock('../../src/gateway/services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn(() => ({})),
}));
vi.mock('../../src/lib/call-llm.js', () => ({ callLLM: mockCallLLM }));
vi.mock('../../src/gateway/services/interaction-classifier.js', () => ({
  InteractionClassifier: vi.fn().mockImplementation(() => ({
    classifyIntent: mockClassifyIntent,
  })),
  resolveArchetypeFromTask: mockResolveArchetypeFromTask,
  resolveArchetypeFromChannel: mockResolveArchetypeFromChannel,
}));

let mockFetch: ReturnType<typeof vi.fn>;

function findFetchCall(urlPattern: string, method = 'GET') {
  return mockFetch.mock.calls.find((args) => {
    const url = args[0] as string;
    const init = args[1] as RequestInit | undefined;
    return (
      url.includes(urlPattern) && (init?.method ?? 'GET').toUpperCase() === method.toUpperCase()
    );
  });
}

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      source: 'thread_reply' as 'thread_reply' | 'mention',
      text: 'The tone was too casual',
      userId: 'U123',
      channelId: 'C123',
      threadTs: '1234567890.000100',
      taskId: 'task-abc-123',
      tenantId: undefined as string | undefined,
      team: undefined as string | undefined,
      ...overrides,
    },
  };
}

async function invokeHandler(
  fn: ReturnType<typeof createInteractionHandlerFunction>,
  event: ReturnType<typeof makeEvent>,
  step: ReturnType<typeof makeStep>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ event, step });
}

function buildFetchMock(taskRows: Array<{ status: string; metadata: Record<string, unknown> }>) {
  return vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (url.includes('/rest/v1/tasks?id=eq.') && method === 'GET') {
      return { json: () => Promise.resolve(taskRows) };
    }
    if (url.includes('/rest/v1/feedback') && method === 'POST') {
      return { json: () => Promise.resolve([{ id: 'fb-uuid-1' }]) };
    }
    if (url.includes('/rest/v1/tasks?id=eq.') && method === 'PATCH') {
      return { json: () => Promise.resolve([]) };
    }
    if (url.includes('slack.com')) {
      return { json: () => Promise.resolve({ ok: true }) };
    }
    return { json: () => Promise.resolve([]) };
  });
}

const CANCELLED_WITH_FLAGS = [
  {
    status: 'Cancelled',
    metadata: { rejection_feedback_requested: true, rejection_user_id: 'U123' },
  },
];
const CANCELLED_FLAG_CLEARED = [
  {
    status: 'Cancelled',
    metadata: { rejection_feedback_requested: false, rejection_user_id: 'U123' },
  },
];
const DONE_TASK = [{ status: 'Done', metadata: {} }];
const CANCELLED_NO_FLAGS = [{ status: 'Cancelled', metadata: {} }];

describe('interaction-handler — rejection feedback routing', () => {
  let inngest: Inngest;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCallLLM.mockResolvedValue({ content: 'Acknowledged!', usage: {} });
    mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test' });
    mockClassifyIntent.mockResolvedValue('feedback');
    mockResolveArchetypeFromTask.mockResolvedValue({
      id: 'arch-1',
      role_name: 'Papi Chulo',
      tenantId: 'tenant-1',
    });
    mockResolveArchetypeFromChannel.mockResolvedValue({
      id: 'arch-1',
      role_name: 'Papi Chulo',
      notification_channel: null,
    });
    inngest = new Inngest({ id: 'test-app' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('Scenario 1: rejector reply on cancelled task is stored as rejection_reason, classifier skipped', async () => {
    mockFetch = buildFetchMock(CANCELLED_WITH_FLAGS);
    vi.stubGlobal('fetch', mockFetch);

    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ userId: 'U123', text: 'The tone was too casual' }), step);

    const feedbackPost = findFetchCall('/rest/v1/feedback', 'POST');
    expect(feedbackPost).toBeDefined();
    const body = JSON.parse((feedbackPost![1] as RequestInit).body as string) as {
      feedback_type: string;
      correction_reason: string;
    };
    expect(body.feedback_type).toBe('rejection_reason');
    expect(body.correction_reason).toBe('The tone was too casual');

    expect(mockClassifyIntent).not.toHaveBeenCalled();

    expect(step.sendEvent).toHaveBeenCalledWith(
      'emit-rejection-rule-extract',
      expect.objectContaining({ name: 'employee/rule.extract-requested' }),
    );
  });

  it('Scenario 2: non-rejector reply on cancelled task triggers normal classification', async () => {
    mockFetch = buildFetchMock(CANCELLED_WITH_FLAGS);
    vi.stubGlobal('fetch', mockFetch);

    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ userId: 'U456' }), step);

    expect(mockClassifyIntent).toHaveBeenCalled();

    const rejectionFeedbackPost = mockFetch.mock.calls.find((args) => {
      const url = args[0] as string;
      const init = args[1] as RequestInit | undefined;
      if (!url.includes('/rest/v1/feedback') || (init?.method ?? 'GET').toUpperCase() !== 'POST') {
        return false;
      }
      try {
        const parsed = JSON.parse(init?.body as string) as { feedback_type: string };
        return parsed.feedback_type === 'rejection_reason';
      } catch {
        return false;
      }
    });
    expect(rejectionFeedbackPost).toBeUndefined();
  });

  it('Scenario 3: reply on non-cancelled (Done) task triggers normal classification', async () => {
    mockFetch = buildFetchMock(DONE_TASK);
    vi.stubGlobal('fetch', mockFetch);

    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ userId: 'U123' }), step);

    expect(mockClassifyIntent).toHaveBeenCalled();

    const rejectionFeedbackPost = mockFetch.mock.calls.find((args) => {
      const url = args[0] as string;
      const init = args[1] as RequestInit | undefined;
      if (!url.includes('/rest/v1/feedback') || (init?.method ?? 'GET').toUpperCase() !== 'POST') {
        return false;
      }
      try {
        const parsed = JSON.parse(init?.body as string) as { feedback_type: string };
        return parsed.feedback_type === 'rejection_reason';
      } catch {
        return false;
      }
    });
    expect(rejectionFeedbackPost).toBeUndefined();
  });

  it('Scenario 4: reply on cancelled task without rejection flags triggers normal classification', async () => {
    mockFetch = buildFetchMock(CANCELLED_NO_FLAGS);
    vi.stubGlobal('fetch', mockFetch);

    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ userId: 'U123' }), step);

    expect(mockClassifyIntent).toHaveBeenCalled();

    const rejectionFeedbackPost = mockFetch.mock.calls.find((args) => {
      const url = args[0] as string;
      const init = args[1] as RequestInit | undefined;
      if (!url.includes('/rest/v1/feedback') || (init?.method ?? 'GET').toUpperCase() !== 'POST') {
        return false;
      }
      try {
        const parsed = JSON.parse(init?.body as string) as { feedback_type: string };
        return parsed.feedback_type === 'rejection_reason';
      } catch {
        return false;
      }
    });
    expect(rejectionFeedbackPost).toBeUndefined();
  });

  it('Scenario 5: rejection feedback PATCH clears rejection_feedback_requested flag', async () => {
    mockFetch = buildFetchMock(CANCELLED_WITH_FLAGS);
    vi.stubGlobal('fetch', mockFetch);

    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ userId: 'U123' }), step);

    const patchCall = findFetchCall('/rest/v1/tasks?id=eq.', 'PATCH');
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse((patchCall![1] as RequestInit).body as string) as {
      metadata: { rejection_feedback_requested: boolean };
    };
    expect(patchBody.metadata.rejection_feedback_requested).toBe(false);
  });

  it('Scenario 6: rule.extract-requested emitted with canonical rejection_reason payload', async () => {
    mockFetch = buildFetchMock(CANCELLED_WITH_FLAGS);
    vi.stubGlobal('fetch', mockFetch);

    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ userId: 'U123', text: 'The tone was too casual' }), step);

    expect(step.sendEvent).toHaveBeenCalledWith('emit-rejection-rule-extract', {
      name: 'employee/rule.extract-requested',
      data: {
        feedbackId: 'fb-uuid-1',
        feedbackType: 'rejection_reason',
        taskId: 'task-abc-123',
        archetypeId: 'arch-1',
        tenantId: 'tenant-1',
        content: 'The tone was too casual',
      },
    });
  });

  it('Scenario 7: second reply from rejector after flag cleared triggers normal classification', async () => {
    mockFetch = buildFetchMock(CANCELLED_FLAG_CLEARED);
    vi.stubGlobal('fetch', mockFetch);

    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ userId: 'U123' }), step);

    expect(mockClassifyIntent).toHaveBeenCalled();

    const rejectionFeedbackPost = mockFetch.mock.calls.find((args) => {
      const url = args[0] as string;
      const init = args[1] as RequestInit | undefined;
      if (!url.includes('/rest/v1/feedback') || (init?.method ?? 'GET').toUpperCase() !== 'POST') {
        return false;
      }
      try {
        const parsed = JSON.parse(init?.body as string) as { feedback_type: string };
        return parsed.feedback_type === 'rejection_reason';
      } catch {
        return false;
      }
    });
    expect(rejectionFeedbackPost).toBeUndefined();
  });
});
