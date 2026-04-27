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

function findFetchCall(pattern: string) {
  return mockFetch.mock.calls.find(
    (args: unknown[]) => typeof args[0] === 'string' && args[0].includes(pattern),
  );
}

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

const defaultData = {
  source: 'thread_reply' as 'thread_reply' | 'mention',
  text: 'Great work!',
  userId: 'U123',
  channelId: 'C123',
  threadTs: '1234567890.000100',
  taskId: 'task-abc-123',
  tenantId: undefined as string | undefined,
  team: undefined as string | undefined,
};

function makeEvent(overrides: Partial<typeof defaultData> = {}) {
  return { data: { ...defaultData, ...overrides } };
}

async function invokeHandler(
  fn: ReturnType<typeof createInteractionHandlerFunction>,
  event: ReturnType<typeof makeEvent>,
  step: ReturnType<typeof makeStep>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ event, step });
}

describe('createInteractionHandlerFunction', () => {
  let inngest: Inngest;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('slack.com')) {
        return Promise.resolve({
          json: () => Promise.resolve({ ok: true, ts: '123', channel: 'C123' }),
        });
      }
      if (url.includes('feedback')) {
        return Promise.resolve({ json: () => Promise.resolve([{ id: 'fb-1' }]) });
      }
      if (url.includes('knowledge_base_entries')) {
        return Promise.resolve({ json: () => Promise.resolve([{ content: 'KB entry 1' }]) });
      }
      return Promise.resolve({ json: () => Promise.resolve([]) });
    });
    vi.stubGlobal('fetch', mockFetch);

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

  it('creates an Inngest function without throwing', () => {
    expect(() => createInteractionHandlerFunction(inngest)).not.toThrow();
  });

  it('thread_reply + feedback intent: stores with feedback_type thread_reply', async () => {
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step);

    const feedbackCall = findFetchCall('/feedback');
    expect(feedbackCall).toBeDefined();
    const body = JSON.parse((feedbackCall![1] as RequestInit).body as string);
    expect(body.feedback_type).toBe('thread_reply');
  });

  it('thread_reply + teaching intent: stores with feedback_type teaching', async () => {
    mockClassifyIntent.mockResolvedValue('teaching');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step);

    const feedbackCall = findFetchCall('/feedback');
    expect(feedbackCall).toBeDefined();
    const body = JSON.parse((feedbackCall![1] as RequestInit).body as string);
    expect(body.feedback_type).toBe('teaching');
  });

  it('thread_reply + question intent: queries KB and posts answer', async () => {
    mockClassifyIntent.mockResolvedValue('question');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step);

    const kbCall = findFetchCall('knowledge_base_entries');
    expect(kbCall).toBeDefined();
    expect(mockCallLLM).toHaveBeenCalled();
    const slackCall = findFetchCall('slack.com');
    expect(slackCall).toBeDefined();
  });

  it('thread_reply + task intent: emits task.requested event, no storage', async () => {
    mockClassifyIntent.mockResolvedValue('task');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step);

    const feedbackCall = findFetchCall('/feedback');
    expect(feedbackCall).toBeUndefined();
    expect(step.sendEvent).toHaveBeenCalledWith(
      'emit-task-requested',
      expect.objectContaining({ name: 'employee/task.requested' }),
    );
  });

  it('mention + feedback intent: stores with feedback_type mention_feedback', async () => {
    mockClassifyIntent.mockResolvedValue('feedback');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(
      fn,
      makeEvent({ source: 'mention', taskId: undefined, tenantId: 'tenant-1' }),
      step,
    );

    const feedbackCall = findFetchCall('/feedback');
    expect(feedbackCall).toBeDefined();
    const body = JSON.parse((feedbackCall![1] as RequestInit).body as string);
    expect(body.feedback_type).toBe('mention_feedback');
  });

  it('mention + teaching intent: stores with feedback_type teaching', async () => {
    mockClassifyIntent.mockResolvedValue('teaching');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(
      fn,
      makeEvent({ source: 'mention', taskId: undefined, tenantId: 'tenant-1' }),
      step,
    );

    const feedbackCall = findFetchCall('/feedback');
    expect(feedbackCall).toBeDefined();
    const body = JSON.parse((feedbackCall![1] as RequestInit).body as string);
    expect(body.feedback_type).toBe('teaching');
  });

  it('mention + question intent: queries KB and posts answer', async () => {
    mockClassifyIntent.mockResolvedValue('question');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(
      fn,
      makeEvent({ source: 'mention', taskId: undefined, tenantId: 'tenant-1' }),
      step,
    );

    const kbCall = findFetchCall('knowledge_base_entries');
    expect(kbCall).toBeDefined();
    const slackCall = findFetchCall('slack.com');
    expect(slackCall).toBeDefined();
  });

  it('mention + task intent: emits task.requested event', async () => {
    mockClassifyIntent.mockResolvedValue('task');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(
      fn,
      makeEvent({ source: 'mention', taskId: undefined, tenantId: 'tenant-1' }),
      step,
    );

    expect(step.sendEvent).toHaveBeenCalledWith(
      'emit-task-requested',
      expect.objectContaining({ name: 'employee/task.requested' }),
    );
  });

  it('missing tenantId on mention: returns early, no classification', async () => {
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(
      fn,
      makeEvent({ source: 'mention', taskId: undefined, tenantId: undefined }),
      step,
    );

    expect(step.run).toHaveBeenCalledTimes(1);
    expect(step.run).toHaveBeenCalledWith('resolve-context', expect.any(Function));
    expect(step.sendEvent).not.toHaveBeenCalled();
    expect(mockClassifyIntent).not.toHaveBeenCalled();
  });

  it('resolveArchetypeFromTask returns null on thread_reply: returns early', async () => {
    mockResolveArchetypeFromTask.mockResolvedValueOnce(null);
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step);

    expect(step.run).toHaveBeenCalledTimes(1);
    expect(step.sendEvent).not.toHaveBeenCalled();
    expect(mockClassifyIntent).not.toHaveBeenCalled();
  });

  it('no Slack bot token: ack step skipped, no throw', async () => {
    mockLoadTenantEnv.mockResolvedValue({});
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await expect(
      invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step),
    ).resolves.not.toThrow();

    const slackCall = findFetchCall('slack.com');
    expect(slackCall).toBeUndefined();
  });

  it('ack includes thread_ts when present', async () => {
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(
      fn,
      makeEvent({ source: 'thread_reply', taskId: 'task-abc-123', threadTs: '1234567890.000100' }),
      step,
    );

    const slackCall = findFetchCall('slack.com');
    expect(slackCall).toBeDefined();
    const reqInit = slackCall![1] as RequestInit;
    const body = JSON.parse(reqInit.body as string);
    expect(body.thread_ts).toBe('1234567890.000100');
  });

  it('ack includes task ID context block', async () => {
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc' }), step);

    const slackCall = findFetchCall('slack.com');
    expect(slackCall).toBeDefined();
    const reqInit = slackCall![1] as RequestInit;
    const body = JSON.parse(reqInit.body as string);
    const contextBlock = body.blocks.find((b: { type: string }) => b.type === 'context');
    expect(contextBlock).toBeDefined();
    expect(contextBlock.elements[0].text).toContain('task-abc');
  });

  it('GM-18 event emitted for feedback intent', async () => {
    mockClassifyIntent.mockResolvedValue('feedback');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step);

    expect(step.sendEvent).toHaveBeenCalledWith(
      'emit-rule-extract',
      expect.objectContaining({ name: 'employee/rule.extract-requested' }),
    );
  });

  it('GM-18 event emitted for teaching intent', async () => {
    mockClassifyIntent.mockResolvedValue('teaching');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step);

    expect(step.sendEvent).toHaveBeenCalledWith(
      'emit-rule-extract',
      expect.objectContaining({ name: 'employee/rule.extract-requested' }),
    );
  });

  it('no GM-18 event for question intent', async () => {
    mockClassifyIntent.mockResolvedValue('question');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step);

    const ruleExtractCall = step.sendEvent.mock.calls.find(
      (args: unknown[]) =>
        Array.isArray(args) &&
        typeof args[1] === 'object' &&
        args[1] !== null &&
        (args[1] as { name: string }).name === 'employee/rule.extract-requested',
    );
    expect(ruleExtractCall).toBeUndefined();
  });

  it('KB lookup uses correct tenant_id and limit=5', async () => {
    mockClassifyIntent.mockResolvedValue('question');
    const fn = createInteractionHandlerFunction(inngest);
    const step = makeStep();

    await invokeHandler(fn, makeEvent({ source: 'thread_reply', taskId: 'task-abc-123' }), step);

    const kbCall = findFetchCall('knowledge_base_entries');
    expect(kbCall).toBeDefined();
    expect(kbCall![0] as string).toContain('tenant_id=eq.tenant-1');
    expect(kbCall![0] as string).toContain('limit=5');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });
});
