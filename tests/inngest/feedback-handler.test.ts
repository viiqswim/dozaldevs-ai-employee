import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Inngest } from 'inngest';
import { createFeedbackHandlerFunction } from '../../src/inngest/feedback-handler.js';

const mockIngestThreadReply = vi.fn().mockResolvedValue(undefined);

vi.mock('@prisma/client', () => {
  const mockPrisma = {
    task: { findUnique: vi.fn() },
    feedback: { create: vi.fn().mockResolvedValue({}) },
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
  return {
    PrismaClient: vi.fn(() => mockPrisma),
    Prisma: { JsonNull: 'JsonNull' },
  };
});

vi.mock('../../src/gateway/services/feedback-service.js', () => ({
  FeedbackService: vi.fn().mockImplementation(() => ({
    ingestThreadReply: mockIngestThreadReply,
  })),
}));

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

function makeEvent(overrides = {}) {
  return {
    data: {
      taskId: 'task-abc-123',
      feedbackText: 'Great work!',
      userId: 'U123456',
      threadTs: '1234567890.000100',
      channelId: 'C123456',
      ...overrides,
    },
  };
}

async function invokeHandler(
  fn: ReturnType<typeof createFeedbackHandlerFunction>,
  event: ReturnType<typeof makeEvent>,
  step: ReturnType<typeof makeStep>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ event, step });
}

describe('createFeedbackHandlerFunction', () => {
  let inngest: Inngest;

  beforeEach(() => {
    inngest = new Inngest({ id: 'test-app' });
    vi.clearAllMocks();
    mockIngestThreadReply.mockResolvedValue(undefined);
  });

  it('creates an Inngest function without throwing', () => {
    expect(() => createFeedbackHandlerFunction(inngest)).not.toThrow();
  });

  it('calls FeedbackService.ingestThreadReply with event data', async () => {
    const fn = createFeedbackHandlerFunction(inngest);
    const step = makeStep();
    const event = makeEvent();

    await invokeHandler(fn, event, step);

    expect(mockIngestThreadReply).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: 'task-abc-123',
        feedbackText: 'Great work!',
        userId: 'U123456',
        threadTs: '1234567890.000100',
        channelId: 'C123456',
      }),
    );
  });

  it('emits employee/feedback.stored event after ingestion', async () => {
    const fn = createFeedbackHandlerFunction(inngest);
    const step = makeStep();
    const event = makeEvent();

    await invokeHandler(fn, event, step);

    expect(step.sendEvent).toHaveBeenCalledWith(
      'emit-feedback-stored',
      expect.objectContaining({
        name: 'employee/feedback.stored',
        data: expect.objectContaining({
          taskId: 'task-abc-123',
          feedbackText: 'Great work!',
        }),
      }),
    );
  });

  it('runs ingest-feedback step before emitting stored event', async () => {
    const fn = createFeedbackHandlerFunction(inngest);
    const callOrder: string[] = [];

    const step = {
      run: vi.fn().mockImplementation(async (name: string, fn: () => Promise<unknown>) => {
        callOrder.push(`run:${name}`);
        return fn();
      }),
      sendEvent: vi.fn().mockImplementation(async (name: string) => {
        callOrder.push(`sendEvent:${name}`);
      }),
    };

    await invokeHandler(fn, makeEvent(), step);

    expect(callOrder[0]).toBe('run:ingest-feedback');
    expect(callOrder[1]).toBe('sendEvent:emit-feedback-stored');
  });

  it('passes all event fields to the stored event', async () => {
    const fn = createFeedbackHandlerFunction(inngest);
    const step = makeStep();
    const event = makeEvent({
      taskId: 'task-xyz',
      feedbackText: 'Needs improvement',
      userId: 'U999',
      threadTs: '9999999999.000001',
      channelId: 'C999',
    });

    await invokeHandler(fn, event, step);

    expect(step.sendEvent).toHaveBeenCalledWith(
      'emit-feedback-stored',
      expect.objectContaining({
        data: {
          taskId: 'task-xyz',
          feedbackText: 'Needs improvement',
          userId: 'U999',
          threadTs: '9999999999.000001',
          channelId: 'C999',
        },
      }),
    );
  });
});
