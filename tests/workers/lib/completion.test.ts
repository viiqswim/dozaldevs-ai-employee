import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runCompletionFlow,
  sendCompletionEvent,
  writeCompletionToSupabase,
} from '../../../src/workers/lib/completion.js';
import type { PostgRESTClient } from '../../../src/workers/lib/postgrest-client.js';

function createMockClient(): PostgRESTClient {
  return {
    get: vi.fn().mockResolvedValue([]),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
  };
}

const BASE_PARAMS = {
  taskId: 'task-123',
  executionId: 'exec-456',
  prUrl: 'https://github.com/org/repo/pull/1',
};
const BASE_PARAMS_NO_PR = { taskId: 'task-123', executionId: 'exec-456', prUrl: null };

describe('writeCompletionToSupabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('patches tasks table with Submitting status and updated_at', async () => {
    const mockClient = createMockClient();
    await writeCompletionToSupabase(BASE_PARAMS, mockClient);

    expect(mockClient.patch).toHaveBeenCalledWith(
      'tasks',
      'id=eq.task-123',
      expect.objectContaining({
        status: 'Submitting',
        updated_at: expect.any(String),
      }),
    );
  });

  it('posts deliverables with pull_request type and prUrl when prUrl is provided', async () => {
    const mockClient = createMockClient();
    await writeCompletionToSupabase(BASE_PARAMS, mockClient);

    expect(mockClient.post).toHaveBeenCalledWith(
      'deliverables',
      expect.objectContaining({
        execution_id: 'exec-456',
        delivery_type: 'pull_request',
        external_ref: 'https://github.com/org/repo/pull/1',
        status: 'submitted',
      }),
    );
  });

  it('posts deliverables with no_changes type and null external_ref when prUrl is null', async () => {
    const mockClient = createMockClient();
    await writeCompletionToSupabase(BASE_PARAMS_NO_PR, mockClient);

    expect(mockClient.post).toHaveBeenCalledWith(
      'deliverables',
      expect.objectContaining({
        execution_id: 'exec-456',
        delivery_type: 'no_changes',
        external_ref: null,
        status: 'submitted',
      }),
    );
  });

  it('posts task_status_log with correct transition and machine actor', async () => {
    const mockClient = createMockClient();
    await writeCompletionToSupabase(BASE_PARAMS, mockClient);

    expect(mockClient.post).toHaveBeenCalledWith('task_status_log', {
      task_id: 'task-123',
      from_status: 'Executing',
      to_status: 'Submitting',
      actor: 'machine',
    });
  });

  it('returns true when all steps succeed', async () => {
    const mockClient = createMockClient();
    const result = await writeCompletionToSupabase(BASE_PARAMS, mockClient);
    expect(result).toBe(true);
  });

  it('returns false when PATCH throws', async () => {
    const mockClient = createMockClient();
    mockClient.patch = vi.fn().mockRejectedValue(new Error('DB connection failed'));

    const result = await writeCompletionToSupabase(BASE_PARAMS, mockClient);
    expect(result).toBe(false);
  });

  it('returns false when PATCH returns null', async () => {
    const mockClient = createMockClient();
    mockClient.patch = vi.fn().mockResolvedValue(null);

    const result = await writeCompletionToSupabase(BASE_PARAMS, mockClient);
    expect(result).toBe(false);
  });

  it('still returns true when deliverables POST throws', async () => {
    const mockClient = createMockClient();
    let postCallCount = 0;
    mockClient.post = vi.fn().mockImplementation(() => {
      postCallCount++;
      if (postCallCount === 1) throw new Error('deliverables insert failed');
      return Promise.resolve({});
    });

    const result = await writeCompletionToSupabase(BASE_PARAMS, mockClient);
    expect(result).toBe(true);
  });

  it('still returns true when task_status_log POST throws', async () => {
    const mockClient = createMockClient();
    let postCallCount = 0;
    mockClient.post = vi.fn().mockImplementation(() => {
      postCallCount++;
      if (postCallCount === 2) throw new Error('status log insert failed');
      return Promise.resolve({});
    });

    const result = await writeCompletionToSupabase(BASE_PARAMS, mockClient);
    expect(result).toBe(true);
  });

  it('logs warning but does not throw when PATCH fails', async () => {
    const mockClient = createMockClient();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockClient.patch = vi.fn().mockRejectedValue(new Error('timeout'));

    await expect(writeCompletionToSupabase(BASE_PARAMS, mockClient)).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[completion] PATCH tasks error'));
    warnSpy.mockRestore();
  });
});

describe('sendCompletionEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INNGEST_BASE_URL;
    delete process.env.INNGEST_EVENT_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete process.env.INNGEST_BASE_URL;
    delete process.env.INNGEST_EVENT_KEY;
  });

  it('posts to default Inngest URL with correct event name', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendCompletionEvent(BASE_PARAMS);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8288/e/local',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses INNGEST_BASE_URL and INNGEST_EVENT_KEY env vars when set', async () => {
    process.env.INNGEST_BASE_URL = 'https://inn.gs';
    process.env.INNGEST_EVENT_KEY = 'prod-key';

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendCompletionEvent(BASE_PARAMS);

    expect(fetchMock).toHaveBeenCalledWith('https://inn.gs/e/prod-key', expect.any(Object));
  });

  it('sends deterministic event ID from taskId and executionId only (no Date.now)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendCompletionEvent(BASE_PARAMS);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(callBody.id).toBe('task-task-123-completion-exec-456');
  });

  it('includes taskId, executionId, and prUrl in event data', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendCompletionEvent(BASE_PARAMS);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(callBody.data).toEqual({
      taskId: 'task-123',
      executionId: 'exec-456',
      prUrl: 'https://github.com/org/repo/pull/1',
    });
  });

  it('returns true on successful first attempt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendCompletionEvent(BASE_PARAMS);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds on the 3rd attempt', async () => {
    vi.useFakeTimers();

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const promise = sendCompletionEvent(BASE_PARAMS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns false after all 3 attempts fail', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockRejectedValue(new Error('persistent failure'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = sendCompletionEvent(BASE_PARAMS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns false after all 3 attempts return non-ok HTTP status', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const promise = sendCompletionEvent(BASE_PARAMS);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not throw when all retries fail', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockRejectedValue(new Error('down'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = sendCompletionEvent(BASE_PARAMS);
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe(false);
  });

  it('uses JSON content-type header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await sendCompletionEvent(BASE_PARAMS);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});

describe('runCompletionFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls Supabase PATCH before Inngest HTTP POST (hard ordering guarantee)', async () => {
    const patchMock = vi.fn().mockResolvedValue({});
    const mockClient: PostgRESTClient = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({}),
      patch: patchMock,
    };

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await runCompletionFlow(BASE_PARAMS, mockClient);

    expect(patchMock.mock.invocationCallOrder[0]).toBeLessThan(
      fetchMock.mock.invocationCallOrder[0],
    );
  });

  it('returns { supabaseWritten: true, inngestSent: true } on full success', async () => {
    const mockClient = createMockClient();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runCompletionFlow(BASE_PARAMS, mockClient);
    expect(result).toEqual({ supabaseWritten: true, inngestSent: true });
  });

  it('returns { supabaseWritten: false, inngestSent: false } when Supabase PATCH fails', async () => {
    const mockClient = createMockClient();
    mockClient.patch = vi.fn().mockRejectedValue(new Error('DB error'));

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runCompletionFlow(BASE_PARAMS, mockClient);
    expect(result).toEqual({ supabaseWritten: false, inngestSent: false });
  });

  it('does not call Inngest when Supabase PATCH fails', async () => {
    const mockClient = createMockClient();
    mockClient.patch = vi.fn().mockRejectedValue(new Error('DB error'));

    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await runCompletionFlow(BASE_PARAMS, mockClient);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns { supabaseWritten: true, inngestSent: false } when Inngest fails after Supabase succeeds', async () => {
    vi.useFakeTimers();

    const mockClient = createMockClient();
    const fetchMock = vi.fn().mockRejectedValue(new Error('inngest down'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = runCompletionFlow(BASE_PARAMS, mockClient);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({ supabaseWritten: true, inngestSent: false });

    vi.useRealTimers();
  });

  it('does not throw when Inngest send fails', async () => {
    vi.useFakeTimers();

    const mockClient = createMockClient();
    const fetchMock = vi.fn().mockRejectedValue(new Error('inngest down'));
    vi.stubGlobal('fetch', fetchMock);

    const promise = runCompletionFlow(BASE_PARAMS, mockClient);
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual({ supabaseWritten: true, inngestSent: false });

    vi.useRealTimers();
  });

  it('works correctly with null prUrl (no-changes delivery)', async () => {
    const mockClient = createMockClient();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const result = await runCompletionFlow(BASE_PARAMS_NO_PR, mockClient);
    expect(result).toEqual({ supabaseWritten: true, inngestSent: true });

    expect(mockClient.post).toHaveBeenCalledWith(
      'deliverables',
      expect.objectContaining({ delivery_type: 'no_changes', external_ref: null }),
    );
  });
});
