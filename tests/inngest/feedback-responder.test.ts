import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Inngest } from 'inngest';
import { createFeedbackResponderFunction } from '../../src/inngest/feedback-responder.js';

const { mockPostMessage } = vi.hoisted(() => ({
  mockPostMessage: vi.fn().mockResolvedValue({ ts: '1234567890.000100', channel: 'C123' }),
}));

vi.mock('@prisma/client', () => {
  const mockPrisma = {
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return { PrismaClient: vi.fn(() => mockPrisma) };
});

vi.mock('../../src/gateway/services/tenant-env-loader.js', () => ({
  loadTenantEnv: vi.fn().mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test-token' }),
}));

vi.mock('../../src/gateway/services/tenant-repository.js', () => ({
  TenantRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/gateway/services/tenant-secret-repository.js', () => ({
  TenantSecretRepository: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../../src/lib/call-llm.js', () => ({
  callLLM: vi.fn().mockResolvedValue({ content: 'Thank you for your feedback!', usage: {} }),
}));

vi.mock('../../src/lib/slack-client.js', () => ({
  createSlackClient: vi.fn().mockReturnValue({ postMessage: mockPostMessage }),
}));

import { callLLM } from '../../src/lib/call-llm.js';
import { loadTenantEnv } from '../../src/gateway/services/tenant-env-loader.js';
import { createSlackClient } from '../../src/lib/slack-client.js';

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
}

function makeEvent(overrides = {}) {
  return {
    data: {
      taskId: 'task-abc-123',
      feedbackText: 'Great work on the summary!',
      userId: 'U123456',
      threadTs: '1234567890.000100',
      channelId: 'C123456',
      ...overrides,
    },
  };
}

describe('createFeedbackResponderFunction', () => {
  let inngest: Inngest;

  beforeEach(() => {
    inngest = new Inngest({ id: 'test-app' });
    vi.clearAllMocks();
    vi.mocked(callLLM).mockResolvedValue({
      content: 'Thank you for your feedback!',
      usage: {},
    } as never);
    vi.mocked(loadTenantEnv).mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test-token' } as never);
    mockPostMessage.mockResolvedValue({ ts: '1234567890.000100', channel: 'C123' });
  });

  it('creates an Inngest function without throwing', () => {
    expect(() => createFeedbackResponderFunction(inngest)).not.toThrow();
  });

  it('calls callLLM with claude-haiku-4-5 model', async () => {
    const fn = createFeedbackResponderFunction(inngest);
    const step = makeStep();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (fn as any).fn({ event: makeEvent(), step });

    expect(callLLM).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'anthropic/claude-haiku-4-5' }),
    );
  });

  it('includes feedbackText in the LLM user message', async () => {
    const fn = createFeedbackResponderFunction(inngest);
    const step = makeStep();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (fn as any).fn({
      event: makeEvent({ feedbackText: 'Please fix the formatting' }),
      step,
    });

    expect(callLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Please fix the formatting'),
          }),
        ]),
      }),
    );
  });

  it('posts acknowledgment to Slack when bot token is available', async () => {
    const fn = createFeedbackResponderFunction(inngest);
    const step = makeStep();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (fn as any).fn({ event: makeEvent(), step });

    expect(mockPostMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'C123456',
        text: 'Thank you for your feedback!',
      }),
    );
  });

  it('skips Slack posting when no bot token is available', async () => {
    vi.mocked(loadTenantEnv).mockResolvedValue({} as never);
    delete process.env.SLACK_BOT_TOKEN;

    const fn = createFeedbackResponderFunction(inngest);
    const step = makeStep();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (fn as any).fn({ event: makeEvent(), step });

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('uses createSlackClient with the bot token', async () => {
    const fn = createFeedbackResponderFunction(inngest);
    const step = makeStep();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (fn as any).fn({ event: makeEvent(), step });

    expect(createSlackClient).toHaveBeenCalledWith(
      expect.objectContaining({ botToken: 'xoxb-test-token' }),
    );
  });

  it('uses taskType review for LLM call', async () => {
    const fn = createFeedbackResponderFunction(inngest);
    const step = makeStep();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (fn as any).fn({ event: makeEvent(), step });

    expect(callLLM).toHaveBeenCalledWith(expect.objectContaining({ taskType: 'review' }));
  });

  it('runs the step named generate-and-post-acknowledgment', async () => {
    const fn = createFeedbackResponderFunction(inngest);
    const step = makeStep();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (fn as any).fn({ event: makeEvent(), step });

    expect(step.run).toHaveBeenCalledWith('generate-and-post-acknowledgment', expect.any(Function));
  });
});
