import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { pino } from 'pino';
import { pollForCompletion } from '../../../src/inngest/lib/poll-completion.js';

const silentLogger = pino({ level: 'silent' });

describe('pollForCompletion', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // Helper: create PostgREST row response
  function makeStatusResponse(status: string | null) {
    const rows = status ? [{ status }] : [];
    return { status: 200, json: async () => rows };
  }

  it('should complete on first poll with Submitting status', async () => {
    mockFetch.mockResolvedValueOnce(makeStatusResponse('Submitting'));

    const result = await pollForCompletion({
      taskId: 'task-123',
      supabaseUrl: 'http://localhost:54321',
      supabaseKey: 'test-key',
      maxPolls: 5,
      intervalMs: 0,
      logger: silentLogger,
    });

    expect(result).toEqual({ completed: true, finalStatus: 'Submitting' });
  });

  it('should complete with Done status', async () => {
    mockFetch.mockResolvedValueOnce(makeStatusResponse('Done'));

    const result = await pollForCompletion({
      taskId: 'task-123',
      supabaseUrl: 'http://localhost:54321',
      supabaseKey: 'test-key',
      maxPolls: 5,
      intervalMs: 0,
      logger: silentLogger,
    });

    expect(result).toEqual({ completed: true, finalStatus: 'Done' });
  });

  it('should poll multiple times until completion', async () => {
    mockFetch
      .mockResolvedValueOnce(makeStatusResponse('Executing'))
      .mockResolvedValueOnce(makeStatusResponse('Executing'))
      .mockResolvedValueOnce(makeStatusResponse('Executing'))
      .mockResolvedValueOnce(makeStatusResponse('Submitting'));

    const result = await pollForCompletion({
      taskId: 'task-123',
      supabaseUrl: 'http://localhost:54321',
      supabaseKey: 'test-key',
      maxPolls: 10,
      intervalMs: 0,
      logger: silentLogger,
    });

    expect(result).toEqual({ completed: true, finalStatus: 'Submitting' });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('should timeout after maxPolls', async () => {
    mockFetch.mockResolvedValue(makeStatusResponse('Executing'));

    const result = await pollForCompletion({
      taskId: 'task-123',
      supabaseUrl: 'http://localhost:54321',
      supabaseKey: 'test-key',
      maxPolls: 3,
      intervalMs: 0,
      logger: silentLogger,
    });

    expect(result).toEqual({ completed: false, finalStatus: 'Executing' });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should handle fetch error gracefully and continue polling', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(makeStatusResponse('Submitting'));

    const result = await pollForCompletion({
      taskId: 'task-123',
      supabaseUrl: 'http://localhost:54321',
      supabaseKey: 'test-key',
      maxPolls: 5,
      intervalMs: 0,
      logger: silentLogger,
    });

    expect(result).toEqual({ completed: true, finalStatus: 'Submitting' });
  });

  it('should use default maxPolls of 40', async () => {
    mockFetch.mockResolvedValue(makeStatusResponse('Executing'));

    const result = await pollForCompletion({
      taskId: 'task-123',
      supabaseUrl: 'http://localhost:54321',
      supabaseKey: 'test-key',
      intervalMs: 0,
      logger: silentLogger,
    });

    expect(result).toEqual({ completed: false, finalStatus: 'Executing' });
    expect(mockFetch).toHaveBeenCalledTimes(40);
  });

  it('should call correct PostgREST URL with apikey header', async () => {
    mockFetch.mockResolvedValueOnce(makeStatusResponse('Submitting'));

    await pollForCompletion({
      taskId: 'task-abc',
      supabaseUrl: 'http://test-url:54321',
      supabaseKey: 'test-key-123',
      maxPolls: 5,
      intervalMs: 0,
      logger: silentLogger,
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://test-url:54321/tasks?id=eq.task-abc&select=status');
    expect(options.headers.apikey).toBe('test-key-123');
  });

  it('should treat empty response as non-completion and continue polling', async () => {
    mockFetch
      .mockResolvedValueOnce(makeStatusResponse(null))
      .mockResolvedValueOnce(makeStatusResponse(null))
      .mockResolvedValueOnce(makeStatusResponse(null))
      .mockResolvedValueOnce(makeStatusResponse('Done'));

    const result = await pollForCompletion({
      taskId: 'task-123',
      supabaseUrl: 'http://localhost:54321',
      supabaseKey: 'test-key',
      maxPolls: 10,
      intervalMs: 0,
      logger: silentLogger,
    });

    expect(result).toEqual({ completed: true, finalStatus: 'Done' });
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });
});
