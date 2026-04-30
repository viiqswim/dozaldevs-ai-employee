import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Inngest } from 'inngest';
import { createLearnedRulesExpiryTrigger } from '../../src/inngest/triggers/learned-rules-expiry.js';

let mockFetch: ReturnType<typeof vi.fn>;

function makeStep() {
  return {
    run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    sendEvent: vi.fn().mockResolvedValue(undefined),
  };
}

async function invokeTrigger(
  fn: ReturnType<typeof createLearnedRulesExpiryTrigger>,
  step: ReturnType<typeof makeStep>,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fn as any).fn({ step });
}

describe('createLearnedRulesExpiryTrigger', () => {
  let inngest: Inngest;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-key';
    inngest = new Inngest({ id: 'test-app' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('proposed rules older than 30 days → PATCH each rule to status: expired', async () => {
    mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (url.includes('/rest/v1/learned_rules') && method === 'GET') {
        return { json: () => Promise.resolve([{ id: 'rule-old-1' }, { id: 'rule-old-2' }]) };
      }
      if (url.includes('/rest/v1/learned_rules') && method === 'PATCH') {
        return { json: () => Promise.resolve([]) };
      }
      return { json: () => Promise.resolve([]) };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createLearnedRulesExpiryTrigger(inngest);
    const step = makeStep();

    await invokeTrigger(fn, step);

    const patchCalls = mockFetch.mock.calls.filter(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules?id=eq.') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(2);

    for (const patchCall of patchCalls) {
      const body = JSON.parse((patchCall[1] as RequestInit).body as string);
      expect(body.status).toBe('expired');
    }
  });

  it('expiry query filter includes confirmed_at=is.null — confirmed rules are never expired', async () => {
    mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/rest/v1/learned_rules')) {
        return { json: () => Promise.resolve([]) };
      }
      return { json: () => Promise.resolve([]) };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createLearnedRulesExpiryTrigger(inngest);
    const step = makeStep();

    await invokeTrigger(fn, step);

    const getCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method !== 'PATCH',
    );
    expect(getCall).toBeDefined();
    expect(getCall![0] as string).toContain('confirmed_at=is.null');
    expect(getCall![0] as string).toContain('status=eq.proposed');
  });

  it('recent proposed rules (< 30 days) are not expired — query returns empty → no PATCH', async () => {
    mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/rest/v1/learned_rules')) {
        return { json: () => Promise.resolve([]) };
      }
      return { json: () => Promise.resolve([]) };
    });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createLearnedRulesExpiryTrigger(inngest);
    const step = makeStep();

    await invokeTrigger(fn, step);

    const patchCalls = mockFetch.mock.calls.filter(
      (args: unknown[]) =>
        typeof args[0] === 'string' &&
        args[0].includes('/rest/v1/learned_rules') &&
        (args[1] as RequestInit)?.method === 'PATCH',
    );
    expect(patchCalls).toHaveLength(0);
  });

  it('no rules to expire → function completes without error', async () => {
    mockFetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createLearnedRulesExpiryTrigger(inngest);
    const step = makeStep();

    await expect(invokeTrigger(fn, step)).resolves.not.toThrow();
  });

  it('cutoff timestamp is computed as 30 days in the past relative to now', async () => {
    const before = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    mockFetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) });
    vi.stubGlobal('fetch', mockFetch);

    const fn = createLearnedRulesExpiryTrigger(inngest);
    const step = makeStep();

    const after = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    await invokeTrigger(fn, step);

    const getCall = mockFetch.mock.calls.find(
      (args: unknown[]) =>
        typeof args[0] === 'string' && args[0].includes('/rest/v1/learned_rules'),
    );
    expect(getCall).toBeDefined();
    const url = getCall![0] as string;
    const match = url.match(/created_at=lt\.([^&]+)/);
    expect(match).toBeDefined();
    const cutoffInUrl = match![1];
    expect(cutoffInUrl >= before).toBe(true);
    expect(cutoffInUrl <= after).toBe(true);
  });
});
