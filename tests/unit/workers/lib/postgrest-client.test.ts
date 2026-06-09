import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPostgRESTClient,
  query,
  insert,
  update,
} from '../../../../src/workers/lib/postgrest-client.js';
import type {
  TaskRow,
  PendingApprovalRow,
  TaskMetricsRow,
} from '../../../../src/workers/lib/postgrest-types.js';

const mockLogger = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}));

vi.mock('../../../../src/lib/logger.js', () => ({
  createLogger: () => mockLogger,
  taskLogger: () => mockLogger,
}));

describe('createPostgRESTClient', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  describe('initialization', () => {
    it('returns null-returning client when SUPABASE_URL is missing', async () => {
      delete process.env.SUPABASE_URL;

      const client = createPostgRESTClient();
      const result = await client.get('users', '');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] Missing SUPABASE_URL or SUPABASE_SECRET_KEY',
      );
    });

    it('returns null-returning client when SUPABASE_SECRET_KEY is missing', async () => {
      delete process.env.SUPABASE_SECRET_KEY;

      const client = createPostgRESTClient();
      const result = await client.post('users', { name: 'test' });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] Missing SUPABASE_URL or SUPABASE_SECRET_KEY',
      );
    });

    it('returns null-returning client when both env vars are missing', async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SECRET_KEY;

      const client = createPostgRESTClient();
      const result = await client.patch('users', 'id=1', { name: 'updated' });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] Missing SUPABASE_URL or SUPABASE_SECRET_KEY',
      );
    });
  });

  describe('get()', () => {
    it('returns parsed array on successful 200 response', async () => {
      const mockData = [
        { id: '1', name: 'Alice' },
        { id: '2', name: 'Bob' },
      ];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.get('users', 'limit=10');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns null and warns on 404 response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'not found' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.get('users', 'id=999');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] GET users failed with HTTP 404',
      );
    });

    it('returns null and warns on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network timeout'));
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.get('users', '');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] GET users error: Network timeout',
      );
    });

    it('constructs correct URL with table and query', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      await client.get('users', 'id=eq.5&select=id,name');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:54321/rest/v1/users?id=eq.5&select=id,name');
    });

    it('includes correct headers in request', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([]),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      await client.get('users', '');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers).toEqual({
        apikey: 'test-secret-key',
        Authorization: 'Bearer test-secret-key',
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      });
    });

    it('returns null when response is not an array', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: '1', name: 'Alice' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.get('users', '');

      expect(result).toBeNull();
    });
  });

  describe('post()', () => {
    it('returns first element of array on successful 201 response', async () => {
      const mockData = [{ id: '1', name: 'Alice', created_at: '2024-01-01' }];
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockData),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.post('users', { name: 'Alice' });

      expect(result).toEqual({ id: '1', name: 'Alice', created_at: '2024-01-01' });
    });

    it('returns non-array response directly on 201', async () => {
      const mockData = { id: '1', name: 'Alice' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockData),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.post('users', { name: 'Alice' });

      expect(result).toEqual(mockData);
    });

    it('returns null and warns on 409 conflict response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'duplicate key' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.post('users', { email: 'duplicate@example.com' });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] POST users failed with HTTP 409',
      );
    });

    it('returns null and warns on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.post('users', { name: 'Alice' });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] POST users error: Connection refused',
      );
    });

    it('sends correct URL and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: () => Promise.resolve([{ id: '1' }]),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const body = { name: 'Alice', email: 'alice@example.com' };
      await client.post('users', body);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:54321/rest/v1/users');
      expect(options.method).toBe('POST');
      expect(options.body).toBe(JSON.stringify(body));
    });
  });

  describe('patch()', () => {
    it('returns parsed JSON on successful 200 response', async () => {
      const mockData = { id: '1', name: 'Alice Updated' };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockData),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.patch('users', 'id=eq.1', { name: 'Alice Updated' });

      expect(result).toEqual(mockData);
    });

    it('returns null and warns on 404 response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'not found' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.patch('users', 'id=eq.999', { name: 'Updated' });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] PATCH users failed with HTTP 404',
      );
    });

    it('returns null and warns on network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Socket hang up'));
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const result = await client.patch('users', 'id=eq.1', { name: 'Updated' });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] PATCH users error: Socket hang up',
      );
    });

    it('constructs correct URL with table and query', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      await client.patch('users', 'id=eq.5&name=like.%Alice%', { status: 'active' });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:54321/rest/v1/users?id=eq.5&name=like.%Alice%');
    });

    it('sends correct method and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
      vi.stubGlobal('fetch', mockFetch);

      const client = createPostgRESTClient();
      const body = { name: 'Updated', status: 'active' };
      await client.patch('users', 'id=eq.1', body);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('PATCH');
      expect(options.body).toBe(JSON.stringify(body));
    });
  });
});

describe('generic typed functions', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  describe('query<T>()', () => {
    it('returns typed array on success', async () => {
      const mockData: Pick<TaskRow, 'id' | 'status'>[] = [
        { id: 'task-1', status: 'Done' },
        { id: 'task-2', status: 'Failed' },
      ];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        }),
      );

      const result = await query<Pick<TaskRow, 'id' | 'status'>>('tasks', 'select=id,status');

      expect(result).toEqual(mockData);
      expect(result?.[0].status).toBe('Done');
    });

    it('returns null when env vars are missing', async () => {
      delete process.env.SUPABASE_URL;

      const result = await query<TaskRow>('tasks', 'id=eq.1');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] query: Missing SUPABASE_URL or SUPABASE_SECRET_KEY',
      );
    });

    it('returns null on HTTP error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.resolve({}),
        }),
      );

      const result = await query<TaskRow>('tasks', 'id=eq.1');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] query tasks failed with HTTP 500',
      );
    });

    it('returns null when response is not an array', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: '1' }),
        }),
      );

      const result = await query<TaskRow>('tasks', 'id=eq.1');

      expect(result).toBeNull();
    });

    it('types PendingApprovalRow correctly at compile time', async () => {
      const mockData: PendingApprovalRow[] = [
        {
          id: 'pa-1',
          tenant_id: 'tenant-1',
          thread_uid: 'thread-1',
          task_id: 'task-1',
          slack_ts: '12345.67890',
          channel_id: 'C123',
          created_at: '2026-01-01T00:00:00Z',
          reminder_sent_at: null,
          urgency: false,
          recipient_name: null,
          context_label: null,
          deleted_at: null,
        },
      ];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        }),
      );

      const result = await query<PendingApprovalRow>('pending_approvals', 'task_id=eq.task-1');

      expect(result?.[0].slack_ts).toBe('12345.67890');
      expect(result?.[0].channel_id).toBe('C123');
    });
  });

  describe('insert<T>()', () => {
    it('returns typed record on success', async () => {
      const mockRow: TaskMetricsRow = {
        id: 'metric-1',
        task_id: 'task-1',
        archetype_id: 'arch-1',
        tenant_id: 'tenant-1',
        work_minutes: 15,
        created_at: '2026-01-01T00:00:00Z',
        deleted_at: null,
      };
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 201,
          json: () => Promise.resolve([mockRow]),
        }),
      );

      const result = await insert<TaskMetricsRow>('task_metrics', {
        task_id: 'task-1',
        archetype_id: 'arch-1',
        tenant_id: 'tenant-1',
        work_minutes: 15,
      });

      expect(result?.work_minutes).toBe(15);
    });

    it('returns null when env vars are missing', async () => {
      delete process.env.SUPABASE_SECRET_KEY;

      const result = await insert<TaskMetricsRow>('task_metrics', { task_id: 'task-1' });

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] insert: Missing SUPABASE_URL or SUPABASE_SECRET_KEY',
      );
    });
  });

  describe('update<T>()', () => {
    it('returns typed array on success', async () => {
      const mockData: Pick<TaskRow, 'id' | 'status'>[] = [{ id: 'task-1', status: 'Done' }];
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockData),
        }),
      );

      const result = await update<Pick<TaskRow, 'id' | 'status'>>(
        'tasks',
        { status: 'Done' },
        'id=eq.task-1',
      );

      expect(result?.[0].status).toBe('Done');
    });

    it('returns null when env vars are missing', async () => {
      delete process.env.SUPABASE_URL;

      const result = await update<TaskRow>('tasks', { status: 'Done' }, 'id=eq.task-1');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] update: Missing SUPABASE_URL or SUPABASE_SECRET_KEY',
      );
    });

    it('returns null on HTTP error', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          json: () => Promise.resolve({}),
        }),
      );

      const result = await update<TaskRow>('tasks', { status: 'Done' }, 'id=eq.task-1');

      expect(result).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[postgrest-client] update tasks failed with HTTP 403',
      );
    });
  });
});
