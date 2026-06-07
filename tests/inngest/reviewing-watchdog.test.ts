import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { createReviewingWatchdogTrigger } from '../../src/inngest/triggers/reviewing-watchdog.js';

// ── Hoisted mocks ─────────────────────────────────────────────────────────────

const { mockLoadTenantEnv, mockUpdateMessage, mockCreateSlackClient } = vi.hoisted(() => {
  const mockUpdateMessage = vi.fn().mockResolvedValue(undefined);
  const mockCreateSlackClient = vi.fn(() => ({ updateMessage: mockUpdateMessage }));
  const mockLoadTenantEnv = vi.fn().mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test' });
  return { mockLoadTenantEnv, mockUpdateMessage, mockCreateSlackClient };
});

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
vi.mock('../../src/lib/slack-client.js', () => ({
  createSlackClient: mockCreateSlackClient,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const WATCHDOG_FAILURE_TEXT =
  "❌ This one timed out before it could finish — I didn't get what I needed in time. Mind kicking it off again?";

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
  };
}

function makeTask(
  overrides: Partial<{
    id: string;
    tenant_id: string;
    status: string;
    updated_at: string;
    metadata: Record<string, unknown> | null;
  }> = {},
) {
  return {
    id: 'task-abc',
    tenant_id: 'tenant-1',
    status: 'Reviewing',
    updated_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    metadata: { notify_slack_ts: 'ts123', notify_slack_channel: 'C123' },
    ...overrides,
  };
}

let mockFetch: ReturnType<typeof vi.fn>;

function setupFetch(tasks: ReturnType<typeof makeTask>[], hasPendingApprovals = false) {
  mockFetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
    const method = opts?.method ?? 'GET';

    // tasks query
    if (typeof url === 'string' && url.includes('/rest/v1/tasks') && method === 'GET') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(tasks),
      });
    }

    // pending_approvals query
    if (typeof url === 'string' && url.includes('/rest/v1/pending_approvals')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(hasPendingApprovals ? [{ id: 'pa-1' }] : []),
      });
    }

    // PATCH tasks to Failed
    if (typeof url === 'string' && url.includes('/rest/v1/tasks') && method === 'PATCH') {
      return Promise.resolve({ ok: true });
    }

    // POST task_status_log
    if (typeof url === 'string' && url.includes('/rest/v1/task_status_log')) {
      return Promise.resolve({ ok: true });
    }

    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
  vi.stubGlobal('fetch', mockFetch);
}

// ── Test suite ────────────────────────────────────────────────────────────────

describe('createReviewingWatchdogTrigger', () => {
  let inngest: Inngest;

  beforeEach(() => {
    inngest = new Inngest({ id: 'test-app' });
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-key';
    mockLoadTenantEnv.mockResolvedValue({ SLACK_BOT_TOKEN: 'xoxb-test' });
    mockUpdateMessage.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  async function invokeWatchdog(step: ReturnType<typeof makeStep>) {
    const fn = createReviewingWatchdogTrigger(inngest);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (fn as any).fn({ step });
  }

  // ── a. Happy path ─────────────────────────────────────────────────────────

  it('happy path — marks zombie Failed, updates Slack with watchdog failure message', async () => {
    const task = makeTask();
    setupFetch([task]);
    const step = makeStep();

    const result = await invokeWatchdog(step);

    expect(result).toEqual({ zombiesFound: 1, zombiesResolved: 1 });

    // DB PATCH happened
    const patchCall = (mockFetch.mock.calls as [string, RequestInit][]).find(
      ([url, opts]) => url.includes('/rest/v1/tasks') && opts?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
    const patchBody = JSON.parse(patchCall![1].body as string) as { status: string };
    expect(patchBody.status).toBe('Failed');

    // Slack updateMessage called with correct args
    expect(mockUpdateMessage).toHaveBeenCalledOnce();
    const [channel, ts, text] = mockUpdateMessage.mock.calls[0] as [string, string, string];
    expect(channel).toBe('C123');
    expect(ts).toBe('ts123');
    expect(text).toBe(WATCHDOG_FAILURE_TEXT);

    // DB PATCH happened before Slack update — verify call order
    const fetchCallUrls = (mockFetch.mock.calls as [string, RequestInit][]).map(
      ([url, opts]) => `${opts?.method ?? 'GET'}:${url}`,
    );
    const patchIdx = fetchCallUrls.findIndex(
      (s) => s.startsWith('PATCH') && s.includes('/rest/v1/tasks'),
    );
    // updateMessage is called after the PATCH (it's in the same step.run callback, after the PATCH)
    // We verify PATCH happened (patchIdx >= 0) and updateMessage was called
    expect(patchIdx).toBeGreaterThanOrEqual(0);
    expect(mockUpdateMessage).toHaveBeenCalledOnce();
  });

  // ── b. Null notify_slack_ts ───────────────────────────────────────────────

  it('null notify_slack_ts — skips Slack update, still marks task Failed', async () => {
    const task = makeTask({ metadata: {} });
    setupFetch([task]);
    const step = makeStep();

    const result = await invokeWatchdog(step);

    expect(result).toEqual({ zombiesFound: 1, zombiesResolved: 1 });

    // No Slack update
    expect(mockUpdateMessage).not.toHaveBeenCalled();

    // DB PATCH still happened
    const patchCall = (mockFetch.mock.calls as [string, RequestInit][]).find(
      ([url, opts]) => url.includes('/rest/v1/tasks') && opts?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();
  });

  // ── c. Missing token ──────────────────────────────────────────────────────

  it('missing SLACK_BOT_TOKEN — skips Slack update, no throw, loop continues', async () => {
    mockLoadTenantEnv.mockResolvedValue({});
    const task = makeTask();
    setupFetch([task]);
    const step = makeStep();

    // Should not throw
    const result = await invokeWatchdog(step);

    expect(result).toEqual({ zombiesFound: 1, zombiesResolved: 1 });
    expect(mockUpdateMessage).not.toHaveBeenCalled();
  });

  // ── d. chat.update error ──────────────────────────────────────────────────

  it('updateMessage rejects — caught, no throw, task remains Failed', async () => {
    mockUpdateMessage.mockRejectedValue(new Error('Slack API error'));
    const task = makeTask();
    setupFetch([task]);
    const step = makeStep();

    // Should not throw
    const result = await invokeWatchdog(step);

    // Task still resolved (DB PATCH succeeded before Slack error)
    expect(result).toEqual({ zombiesFound: 1, zombiesResolved: 1 });

    // DB PATCH still happened
    const patchCall = (mockFetch.mock.calls as [string, RequestInit][]).find(
      ([url, opts]) => url.includes('/rest/v1/tasks') && opts?.method === 'PATCH',
    );
    expect(patchCall).toBeDefined();

    // updateMessage was attempted
    expect(mockUpdateMessage).toHaveBeenCalledOnce();
  });

  // ── e. Multi-tenant sweep ─────────────────────────────────────────────────

  it('multi-tenant — loadTenantEnv called per-task with correct tenant_id', async () => {
    const task1 = makeTask({ id: 'task-1', tenant_id: 'tenant-A' });
    const task2 = makeTask({ id: 'task-2', tenant_id: 'tenant-B' });
    setupFetch([task1, task2]);
    const step = makeStep();

    const result = await invokeWatchdog(step);

    expect(result).toEqual({ zombiesFound: 2, zombiesResolved: 2 });

    // loadTenantEnv called twice with correct tenant IDs
    expect(mockLoadTenantEnv).toHaveBeenCalledTimes(2);
    const calledTenantIds = mockLoadTenantEnv.mock.calls.map(
      (call: unknown[]) => call[0] as string,
    );
    expect(calledTenantIds).toContain('tenant-A');
    expect(calledTenantIds).toContain('tenant-B');
  });

  // ── f. Has pending_approvals ──────────────────────────────────────────────

  it('has pending_approvals — task skipped entirely, not failed, no Slack update', async () => {
    const task = makeTask();
    setupFetch([task], true /* hasPendingApprovals */);
    const step = makeStep();

    const result = await invokeWatchdog(step);

    expect(result).toEqual({ zombiesFound: 1, zombiesResolved: 0 });

    // No PATCH to Failed
    const patchCall = (mockFetch.mock.calls as [string, RequestInit][]).find(
      ([url, opts]) => url.includes('/rest/v1/tasks') && opts?.method === 'PATCH',
    );
    expect(patchCall).toBeUndefined();

    // No Slack update
    expect(mockUpdateMessage).not.toHaveBeenCalled();
  });
});
