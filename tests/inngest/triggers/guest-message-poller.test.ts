import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockCreateTaskAndDispatch = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ taskId: 'task-xyz', archetypeId: 'arch-1' }),
);

vi.mock('../../../src/inngest/lib/create-task-and-dispatch.js', () => ({
  createTaskAndDispatch: mockCreateTaskAndDispatch,
}));

import { createGuestMessagePollerTrigger } from '../../../src/inngest/triggers/guest-message-poller.js';

// FIXED_TS = 1_800_000_000_000 ms
// pollIntervalMs  = 30 * 60 * 1000 = 1_800_000
// slotKey         = Math.floor(1_800_000_000_000 / 1_800_000) = 1_000_000
const FIXED_TS = 1_800_000_000_000;

function makeMockStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
}

function makeMockInngest() {
  return {
    createFunction: vi.fn().mockReturnValue({}),
  };
}

function makeMockFetch(archetypesData: unknown[], tenantsData: unknown[]) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/archetypes?')) {
      return Promise.resolve({ json: () => Promise.resolve(archetypesData) });
    }
    if (url.includes('/tenants?')) {
      return Promise.resolve({ json: () => Promise.resolve(tenantsData) });
    }
    return Promise.resolve({ json: () => Promise.resolve([]) });
  });
}

describe('createGuestMessagePollerTrigger', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://test';
    process.env.SUPABASE_SECRET_KEY = 'test-key';
    mockCreateTaskAndDispatch.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates a function with id trigger/guest-message-poller', () => {
    const mockInngest = {
      createFunction: vi.fn().mockReturnValue({ id: 'trigger/guest-message-poller' }),
    };
    createGuestMessagePollerTrigger(mockInngest as never);
    expect(mockInngest.createFunction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'trigger/guest-message-poller' }),
      expect.anything(),
    );
  });

  it('uses cron */5 * * * *', () => {
    const mockInngest = makeMockInngest();
    createGuestMessagePollerTrigger(mockInngest as never);
    const [config] = mockInngest.createFunction.mock.calls[0] as [
      { triggers: Array<{ cron: string }> },
    ];
    expect(config.triggers[0].cron).toBe('*/5 * * * *');
  });

  it('handler calls createTaskAndDispatch with archetypeSlug guest-messaging', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal(
      'fetch',
      makeMockFetch(
        [{ id: 'arch-1', tenant_id: 'tenant-id-1' }],
        [{ id: 'tenant-id-1', config: { guest_messaging: { poll_interval_minutes: 30 } } }],
      ),
    );

    createGuestMessagePollerTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ archetypeSlug: 'guest-messaging' }),
    );
  });

  it('handler calls createTaskAndDispatch with sourceSystem cron', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal(
      'fetch',
      makeMockFetch(
        [{ id: 'arch-1', tenant_id: 'tenant-id-1' }],
        [{ id: 'tenant-id-1', config: { guest_messaging: { poll_interval_minutes: 30 } } }],
      ),
    );

    createGuestMessagePollerTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ sourceSystem: 'cron' }),
    );
  });

  it('externalId uses floor-based slot key', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_TS);
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal(
      'fetch',
      makeMockFetch(
        [{ id: 'arch-1', tenant_id: 'tenant-id-1' }],
        [{ id: 'tenant-id-1', config: { guest_messaging: { poll_interval_minutes: 30 } } }],
      ),
    );

    createGuestMessagePollerTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'guest-poll-tenant-id-1-1000000' }),
    );
  });

  it('missing config fallback uses 30-minute default', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_TS);
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal(
      'fetch',
      makeMockFetch(
        [{ id: 'arch-1', tenant_id: 'tenant-id-1' }],
        [{ id: 'tenant-id-1', config: {} }],
      ),
    );

    createGuestMessagePollerTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch).toHaveBeenCalledWith(
      expect.objectContaining({ externalId: 'guest-poll-tenant-id-1-1000000' }),
    );
  });

  it('no archetypes → returns early, createTaskAndDispatch NOT called', async () => {
    const mockStep = makeMockStep();
    const mockInngest = makeMockInngest();
    vi.stubGlobal('fetch', makeMockFetch([], []));

    createGuestMessagePollerTrigger(mockInngest as never);

    const handler = mockInngest.createFunction.mock.calls[0][1] as (ctx: {
      step: unknown;
    }) => Promise<unknown>;
    await handler({ step: mockStep });

    expect(mockCreateTaskAndDispatch.mock.calls.length).toBe(0);
  });
});
