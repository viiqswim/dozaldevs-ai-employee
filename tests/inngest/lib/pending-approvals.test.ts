import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPendingApproval,
  trackPendingApproval,
  clearPendingApproval,
  clearPendingApprovalByTaskId,
  getStaleApprovals,
  markReminderSent,
} from '../../../src/inngest/lib/pending-approvals.js';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'test-supabase-key';
const TENANT_ID = '00000000-0000-0000-0000-000000000002';
const THREAD_UID = 'thread-hostfully-abc123';
const TASK_ID = '33333333-3333-3333-3333-333333333333';

function makeJsonResponse(data: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: vi.fn().mockResolvedValue(data),
  };
}

describe('getPendingApproval', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when no rows are found', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    const result = await getPendingApproval(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, THREAD_UID);

    expect(result).toBeNull();
  });

  it('returns a PendingApproval object when a row is found', async () => {
    const row = {
      id: 'pending-id-1',
      tenant_id: TENANT_ID,
      thread_uid: THREAD_UID,
      task_id: TASK_ID,
      slack_ts: 'msg-ts-123.000100',
      channel_id: 'C-CHANNEL-123',
      created_at: '2026-04-28T00:00:00Z',
    };
    mockFetch.mockResolvedValue(makeJsonResponse([row]));

    const result = await getPendingApproval(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, THREAD_UID);

    expect(result).not.toBeNull();
    expect(result!.id).toBe('pending-id-1');
    expect(result!.tenantId).toBe(TENANT_ID);
    expect(result!.threadUid).toBe(THREAD_UID);
    expect(result!.taskId).toBe(TASK_ID);
    expect(result!.slackTs).toBe('msg-ts-123.000100');
    expect(result!.channelId).toBe('C-CHANNEL-123');
    expect(result!.createdAt).toBe('2026-04-28T00:00:00Z');
  });

  it('fetches from the correct PostgREST URL with tenant_id and thread_uid filters', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    await getPendingApproval(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, THREAD_UID);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/rest/v1/pending_approvals');
    expect(url).toContain(`tenant_id=eq.${TENANT_ID}`);
    expect(url).toContain(`thread_uid=eq.${THREAD_UID}`);
    expect(url).toContain('limit=1');
  });

  it('sends apikey and Authorization headers', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    await getPendingApproval(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, THREAD_UID);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['apikey']).toBe(SUPABASE_KEY);
    expect(headers['Authorization']).toBe(`Bearer ${SUPABASE_KEY}`);
  });
});

describe('trackPendingApproval', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(makeJsonResponse([]));
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /rest/v1/pending_approvals', async () => {
    await trackPendingApproval(SUPABASE_URL, SUPABASE_KEY, {
      tenantId: TENANT_ID,
      threadUid: THREAD_UID,
      taskId: TASK_ID,
      slackTs: 'msg-ts-456.000200',
      channelId: 'C-CHANNEL-456',
    });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/rest/v1/pending_approvals');
    expect((init.method ?? '').toUpperCase()).toBe('POST');
  });

  it('sends Prefer: resolution=merge-duplicates header for upsert behavior', async () => {
    await trackPendingApproval(SUPABASE_URL, SUPABASE_KEY, {
      tenantId: TENANT_ID,
      threadUid: THREAD_UID,
      taskId: TASK_ID,
      slackTs: 'msg-ts-456.000200',
      channelId: 'C-CHANNEL-456',
    });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers['Prefer']).toBe('resolution=merge-duplicates');
  });

  it('sends correct body fields (snake_case) in request body', async () => {
    const data = {
      tenantId: TENANT_ID,
      threadUid: THREAD_UID,
      taskId: TASK_ID,
      slackTs: 'msg-ts-789.000300',
      channelId: 'C-CHANNEL-789',
    };

    await trackPendingApproval(SUPABASE_URL, SUPABASE_KEY, data);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body['tenant_id']).toBe(TENANT_ID);
    expect(body['thread_uid']).toBe(THREAD_UID);
    expect(body['task_id']).toBe(TASK_ID);
    expect(body['slack_ts']).toBe('msg-ts-789.000300');
    expect(body['channel_id']).toBe('C-CHANNEL-789');
  });
});

describe('clearPendingApproval', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(makeJsonResponse([]));
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a DELETE request', async () => {
    await clearPendingApproval(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, THREAD_UID);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.method ?? '').toUpperCase()).toBe('DELETE');
  });

  it('includes tenant_id and thread_uid in the URL query params', async () => {
    await clearPendingApproval(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, THREAD_UID);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/rest/v1/pending_approvals');
    expect(url).toContain(`tenant_id=eq.${TENANT_ID}`);
    expect(url).toContain(`thread_uid=eq.${THREAD_UID}`);
  });
});

describe('clearPendingApprovalByTaskId', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(makeJsonResponse([]));
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a DELETE request', async () => {
    await clearPendingApprovalByTaskId(SUPABASE_URL, SUPABASE_KEY, TASK_ID);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.method ?? '').toUpperCase()).toBe('DELETE');
  });

  it('includes task_id in the URL query param (not tenant_id or thread_uid)', async () => {
    await clearPendingApprovalByTaskId(SUPABASE_URL, SUPABASE_KEY, TASK_ID);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('/rest/v1/pending_approvals');
    expect(url).toContain(`task_id=eq.${TASK_ID}`);
    expect(url).not.toContain('tenant_id');
    expect(url).not.toContain('thread_uid');
  });
});

describe('getStaleApprovals', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns empty array when no rows found', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    const result = await getStaleApprovals(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, 60);

    expect(result).toEqual([]);
  });

  it('returns mapped PendingApproval objects with all fields including optional ones', async () => {
    const row = {
      id: 'stale-id-1',
      tenant_id: TENANT_ID,
      thread_uid: THREAD_UID,
      task_id: TASK_ID,
      slack_ts: 'msg-ts-stale.000100',
      channel_id: 'C-STALE-123',
      created_at: '2026-04-28T00:00:00Z',
      guest_name: 'John Doe',
      property_name: 'Beach House',
      urgency: true,
    };
    mockFetch.mockResolvedValue(makeJsonResponse([row]));

    const result = await getStaleApprovals(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, 60);

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('stale-id-1');
    expect(result[0]!.tenantId).toBe(TENANT_ID);
    expect(result[0]!.threadUid).toBe(THREAD_UID);
    expect(result[0]!.taskId).toBe(TASK_ID);
    expect(result[0]!.slackTs).toBe('msg-ts-stale.000100');
    expect(result[0]!.channelId).toBe('C-STALE-123');
    expect(result[0]!.createdAt).toBe('2026-04-28T00:00:00Z');
    expect(result[0]!.guestName).toBe('John Doe');
    expect(result[0]!.propertyName).toBe('Beach House');
    expect(result[0]!.urgency).toBe(true);
  });

  it('URL includes reminder_sent_at=is.null filter', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    await getStaleApprovals(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, 60);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('reminder_sent_at=is.null');
  });

  it('URL includes created_at=lt.{cutoff} filter with a valid ISO string', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    const before = Date.now();
    await getStaleApprovals(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, 60);
    const after = Date.now();

    const [url] = mockFetch.mock.calls[0] as [string];
    const match = /created_at=lt\.([^&]+)/.exec(url);
    expect(match).not.toBeNull();
    const cutoffMs = new Date(decodeURIComponent(match![1]!)).getTime();
    // cutoff should be ~60 minutes before now
    expect(cutoffMs).toBeGreaterThanOrEqual(before - 60 * 60 * 1000 - 1000);
    expect(cutoffMs).toBeLessThanOrEqual(after - 60 * 60 * 1000 + 1000);
  });

  it('URL includes tenant_id=eq.{tenantId} filter', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    await getStaleApprovals(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, 60);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain(`tenant_id=eq.${TENANT_ID}`);
  });

  it('URL includes order=created_at.asc', async () => {
    mockFetch.mockResolvedValue(makeJsonResponse([]));

    await getStaleApprovals(SUPABASE_URL, SUPABASE_KEY, TENANT_ID, 60);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('order=created_at.asc');
  });
});

describe('markReminderSent', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue(makeJsonResponse([]));
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a PATCH request', async () => {
    await markReminderSent(SUPABASE_URL, SUPABASE_KEY, ['id1', 'id2']);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.method ?? '').toUpperCase()).toBe('PATCH');
  });

  it('URL includes id=in.(id1,id2,id3) for multiple IDs', async () => {
    await markReminderSent(SUPABASE_URL, SUPABASE_KEY, ['id1', 'id2', 'id3']);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('id=in.(id1,id2,id3)');
  });

  it('body contains reminder_sent_at key with an ISO timestamp string', async () => {
    const before = Date.now();
    await markReminderSent(SUPABASE_URL, SUPABASE_KEY, ['id1']);
    const after = Date.now();

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, string>;
    expect(body['reminder_sent_at']).toBeDefined();
    const ts = new Date(body['reminder_sent_at']!).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after + 1000);
  });

  it('does NOT call fetch when ids array is empty', async () => {
    await markReminderSent(SUPABASE_URL, SUPABASE_KEY, []);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
