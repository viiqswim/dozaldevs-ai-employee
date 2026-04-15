import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTaskAndDispatch } from '../../../src/inngest/lib/create-task-and-dispatch.js';

describe('createTaskAndDispatch', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockInngest: { send: ReturnType<typeof vi.fn> };
  let mockStep: { run: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    mockInngest = {
      send: vi.fn().mockResolvedValue({ ids: ['event-1'] }),
    };

    mockStep = {
      run: vi.fn().mockImplementation(async (_name: string, fn: () => Promise<unknown>) => fn()),
    };

    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SECRET_KEY = 'test-key';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SECRET_KEY;
  });

  function makeJsonResponse(data: unknown, ok = true) {
    return { ok, status: ok ? 200 : 400, json: async () => data };
  }

  it('returns null when a non-terminal task with same external_id exists', async () => {
    // 1. GET archetypes → found
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ id: 'arch-1' }]));
    // 2. GET tasks (duplicate check) → non-terminal duplicate found
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ id: 'existing-task' }]));

    const result = await createTaskAndDispatch({
      inngest: mockInngest as never,
      step: mockStep,
      archetypeSlug: 'daily-summarizer',
      externalId: 'JIRA-123',
      sourceSystem: 'jira',
    });

    expect(result).toEqual({ taskId: null, archetypeId: null });

    // POST /tasks should NOT have been called
    const postCalls = (mockFetch.mock.calls as Array<[string, RequestInit]>).filter(
      ([_url, opts]) => opts?.method === 'POST',
    );
    expect(postCalls).toHaveLength(0);
  });

  it('creates new task when existing task is in terminal state (Done)', async () => {
    // 1. GET archetypes → found
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ id: 'arch-1' }]));
    // 2. GET tasks (duplicate check) → empty (terminal tasks filtered out by query)
    mockFetch.mockResolvedValueOnce(makeJsonResponse([]));
    // 3. POST tasks → new task created
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ id: 'new-task-id' }]));

    const result = await createTaskAndDispatch({
      inngest: mockInngest as never,
      step: mockStep,
      archetypeSlug: 'daily-summarizer',
      externalId: 'JIRA-123',
      sourceSystem: 'jira',
    });

    expect(result).toEqual({ taskId: 'new-task-id', archetypeId: 'arch-1' });
  });

  it('throws when archetype not found', async () => {
    // GET archetypes → empty
    mockFetch.mockResolvedValueOnce(makeJsonResponse([]));

    await expect(
      createTaskAndDispatch({
        inngest: mockInngest as never,
        step: mockStep,
        archetypeSlug: 'daily-summarizer',
        externalId: 'JIRA-123',
        sourceSystem: 'jira',
      }),
    ).rejects.toThrow('Archetype not found: daily-summarizer');
  });

  it('creates task and fires Inngest event on success', async () => {
    // 1. GET archetypes → found
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ id: 'arch-1' }]));
    // 2. GET tasks (duplicate check) → no duplicates
    mockFetch.mockResolvedValueOnce(makeJsonResponse([]));
    // 3. POST tasks → task created
    mockFetch.mockResolvedValueOnce(makeJsonResponse([{ id: 'task-123' }]));

    const result = await createTaskAndDispatch({
      inngest: mockInngest as never,
      step: mockStep,
      archetypeSlug: 'daily-summarizer',
      externalId: 'JIRA-123',
      sourceSystem: 'jira',
    });

    expect(result).toEqual({ taskId: 'task-123', archetypeId: 'arch-1' });

    expect(mockInngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'employee/task.dispatched',
        data: { taskId: 'task-123', archetypeId: 'arch-1' },
      }),
    );
  });
});
