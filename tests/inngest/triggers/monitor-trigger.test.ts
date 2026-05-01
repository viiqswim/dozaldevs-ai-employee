import { afterEach, describe, expect, it, vi } from 'vitest';

const mockCreateTaskAndDispatch = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ taskId: 'task-xyz', archetypeId: 'arch-1' }),
);

vi.mock('../../../src/inngest/lib/create-task-and-dispatch.js', () => ({
  createTaskAndDispatch: mockCreateTaskAndDispatch,
}));

import { createMonitorTrigger } from '../../../src/inngest/triggers/monitor-trigger.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mockCreateTaskAndDispatch.mockClear();
});

describe('createMonitorTrigger', () => {
  it('creates a function with id trigger/unresponded-message-monitor', () => {
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({ id: 'trigger/unresponded-message-monitor' }),
    };
    createMonitorTrigger(mockInngest as never);
    expect(mockInngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'trigger/unresponded-message-monitor' }),
      expect.anything(),
    );
  });

  it('uses cron */30 * * * *', () => {
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({}),
    };
    createMonitorTrigger(mockInngest as never);
    const [config] = mockInngest.createFunction.mock.calls[0] as [
      { triggers: Array<{ cron: string }> },
    ];
    expect(config.triggers[0].cron).toBe('*/30 * * * *');
  });

  it('dispatches with archetypeSlug, sourceSystem, and tenantId when archetype found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve([{ id: 'arch-1', tenant_id: 'tenant-abc' }]),
      }),
    );

    const mockStep = {
      run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({}),
    };

    createMonitorTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        archetypeSlug: 'unresponded-message-monitor',
        sourceSystem: 'cron',
        tenantId: 'tenant-abc',
      }),
    );
  });

  it('does not call createTaskAndDispatch when no archetypes found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve([]),
      }),
    );

    const mockStep = {
      run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({}),
    };

    createMonitorTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).not.toHaveBeenCalled();
  });

  it('calls createTaskAndDispatch once per tenant when multiple archetypes found', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () =>
          Promise.resolve([
            { id: 'arch-1', tenant_id: 'tenant-aaa' },
            { id: 'arch-2', tenant_id: 'tenant-bbb' },
          ]),
      }),
    );

    const mockStep = {
      run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({}),
    };

    createMonitorTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).toHaveBeenCalledTimes(2);
    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-aaa' }),
    );
    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-bbb' }),
    );
  });

  it('generates externalId starting with monitor- and including tenantId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve([{ id: 'arch-1', tenant_id: 'tenant-xyz' }]),
      }),
    );

    const mockStep = {
      run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({}),
    };

    createMonitorTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: expect.stringMatching(/^monitor-tenant-xyz-/),
      }),
    );
  });
});
