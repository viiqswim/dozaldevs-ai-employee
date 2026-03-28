import { describe, it, expect, afterEach, afterAll, vi } from 'vitest';
import { Inngest } from 'inngest';
import { InngestTestEngine, mockCtx } from '@inngest/test';
import { getPrisma, cleanupTestData, disconnectPrisma } from '../setup.js';
import { createRedispatchFunction } from '../../src/inngest/redispatch.js';

const inngest = new Inngest({ id: 'ai-employee-test' });

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupTestData();
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('redispatch function', () => {
  it('function has correct ID: engineering/task-redispatch', () => {
    const fn = createRedispatchFunction(inngest, getPrisma());
    // @ts-expect-error — accessing opts for testing
    expect((fn as any).opts.id).toBe('engineering/task-redispatch');
  });

  it('emits engineering/task.received via step.sendEvent with taskId and attempt', async () => {
    const sentEvents: Array<{ name: string; data: unknown }> = [];

    const engine = new InngestTestEngine({
      function: createRedispatchFunction(inngest, getPrisma()),
      transformCtx: (ctx: any) => {
        const mocked = mockCtx(ctx);
        mocked.step.sendEvent = vi
          .fn()
          .mockImplementation(async (_id: string, event: { name: string; data: unknown }) => {
            sentEvents.push(event);
          });
        return mocked as any;
      },
    });

    const { error } = await engine.execute({
      events: [
        { name: 'engineering/task.redispatch', data: { taskId: 'test-task-id', attempt: 2 } },
      ],
    });

    expect(error).toBeUndefined();
    expect(sentEvents).toHaveLength(1);
    expect(sentEvents[0].name).toBe('engineering/task.received');
  });

  it('event data includes taskId and attempt from trigger event', async () => {
    const sentEvents: Array<{ name: string; data: unknown }> = [];

    const engine = new InngestTestEngine({
      function: createRedispatchFunction(inngest, getPrisma()),
      transformCtx: (ctx: any) => {
        const mocked = mockCtx(ctx);
        mocked.step.sendEvent = vi
          .fn()
          .mockImplementation(async (_id: string, event: { name: string; data: unknown }) => {
            sentEvents.push(event);
          });
        return mocked as any;
      },
    });

    const { error } = await engine.execute({
      events: [
        { name: 'engineering/task.redispatch', data: { taskId: 'my-task-123', attempt: 3 } },
      ],
    });

    expect(error).toBeUndefined();
    expect(sentEvents).toHaveLength(1);
    const eventData = sentEvents[0].data as Record<string, unknown>;
    expect(eventData.taskId).toBe('my-task-123');
    expect(eventData.attempt).toBe(3);
  });
});
