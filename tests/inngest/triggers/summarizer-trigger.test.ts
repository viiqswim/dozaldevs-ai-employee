import { describe, it, expect, vi } from 'vitest';

const mockCreateTaskAndDispatch = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ taskId: 'task-xyz', archetypeId: 'arch-1' }),
);

vi.mock('../../../src/inngest/lib/create-task-and-dispatch.js', () => ({
  createTaskAndDispatch: mockCreateTaskAndDispatch,
}));

import { createSummarizerTrigger } from '../../../src/inngest/triggers/summarizer-trigger.js';

describe('createSummarizerTrigger', () => {
  it('creates a function with id trigger/daily-summarizer', () => {
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({ id: 'trigger/daily-summarizer' }),
    };
    createSummarizerTrigger(mockInngest as never);
    expect(mockInngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'trigger/daily-summarizer' }),
      expect.anything(),
    );
  });

  it('uses cron 0 8 * * 1-5', () => {
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({}),
    };
    createSummarizerTrigger(mockInngest as never);
    const [config] = mockInngest.createFunction.mock.calls[0] as [
      { triggers: Array<{ cron: string }> },
    ];
    expect(config.triggers[0].cron).toBe('0 8 * * 1-5');
  });

  it('handler calls createTaskAndDispatch with archetypeSlug daily-summarizer', async () => {
    const mockStep = {
      run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({}),
    };

    createSummarizerTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ archetypeSlug: 'daily-summarizer' }),
    );
  });

  it('handler calls createTaskAndDispatch with sourceSystem cron', async () => {
    const mockStep = {
      run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({}),
    };

    createSummarizerTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSystem: 'cron' }),
    );
  });
});
